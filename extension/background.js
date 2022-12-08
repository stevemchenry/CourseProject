/*
Author:     Steve McHenry
Project:    CS 410 Course Project
Date:       Fall 2022
*/

"use strict";

import * as tokenizer from "./scripts/tokenizer.js";

// Remove the fragment of the provided URL if one exists
function urlRemoveFragment(url) {
    return url.replace(/#.*$/, '');
}

// Get a handle to the database
async function databaseOpen() {
    const idbRequest = indexedDB.open("BookmarkOrganizer", 1);
    idbRequest.onupgradeneeded = databaseUpgrade;
    
    return new Promise((resolve, reject) => {
        idbRequest.onsuccess = () => {resolve(idbRequest.result);};
        idbRequest.onerror = (event) => {reject(event);};
    });
}

// Upgrade the database to the current version (IndexedDB API detail)
function databaseUpgrade(event) {
    const db = event.target.result;

    const objectStoreDocument = db.createObjectStore("Document", {keyPath: "id", autoIncrement: true});
    objectStoreDocument.createIndex("Document_url", "url", {unique: true});

    const objectStoreDictionary = db.createObjectStore("Dictionary", {keyPath: "id", autoIncrement: true});
    objectStoreDictionary.createIndex("Dictionary_term", "term", {unique: true});

    const objectStorePosting = db.createObjectStore("Posting", {keyPath: ["termID", "documentID"]});
    objectStorePosting.createIndex("Posting_termID", "termID");
    objectStorePosting.createIndex("Posting_documentID", "documentID");

    const objectStoreCollection = db.createObjectStore("Collection", {keyPath: "id", autoIncrement: true});
    objectStoreCollection.createIndex("Collection_name", "name", {unique: true});

    const objectStoreDocumentCollection = db.createObjectStore("DocumentCollection", {keyPath: ["documentID", "collectionID"]});
    objectStoreDocumentCollection.createIndex("DocumentCollection_documentID", "documentID");
    objectStoreDocumentCollection.createIndex("DocumentCollection_collectionID", "collectionID");
}

// Convert an array of terms from a single document into a postings list
function termsToPostings(terms) {
    const postings = new Map();
    let currentPosition = 0;

    for(const term of terms) {
        const posting = postings.get(term);

        // If a posting entry for the current term exists, update it;
        // otherwise, add a new entry
        if(posting) {
            posting.termFrequency++;
            posting.positions.push(currentPosition);

        } else {
            postings.set(term, {termFrequency: 1, positions: [currentPosition]});
        }

        ++currentPosition;
    }

    return postings;
}

// Calculate the average document length
async function calculateAverageDocumentLength() {
    return databaseOpen().then((db) => {
        // Calculate the current average document length
        const transaction = db.transaction("Document", "readonly");
        const objectStoreDocument = transaction.objectStore("Document");

        const queryGetDocuments = objectStoreDocument.getAll();

        return new Promise((resolve) => {
            queryGetDocuments.onsuccess = () => {
                let averageDocumentLength = 0;
                let documentCount = 0;

                for(const document of queryGetDocuments.result) {
                    averageDocumentLength += document.length;
                    ++documentCount;
                }

                averageDocumentLength /= documentCount;
                resolve(averageDocumentLength);
            }
        });
    });
}

// Score a single query term
async function scoreTerm(term, queryTermFrequency, averageDocumentLength) {
    // Create a variable to store the database connection shared by the promise chain
    let db = null;
    
    return databaseOpen().then((dbHandle) => {
        // Get the current query term from the dictionary if it exists
        db = dbHandle;
        const transaction = db.transaction("Dictionary", "readonly");
        const objectStoreDictionary = transaction.objectStore("Dictionary");
        const indexDictionaryTerm = objectStoreDictionary.index("Dictionary_term");
        const queryGetDictionaryTerm = indexDictionaryTerm.get(term);

        return new Promise((resolve, reject) => {
            queryGetDictionaryTerm.onsuccess = () => {
                if(!queryGetDictionaryTerm.result) {
                    // The term does not exist in the dictionary
                    reject(new Error("Term \"" + term + "\" does not exist in the dictionary"));
                    return;
                }
                
                resolve(queryGetDictionaryTerm.result.id);
            }
        });

    }).then((termID) => {
        // Get all documents that contain an instance of the dictionary term
        const transaction = db.transaction("Posting", "readonly");
        const objectStorePosting = transaction.objectStore("Posting");
        const indexPostingTermID = objectStorePosting.index("Posting_termID");
        const queryGetPostingByTermID = indexPostingTermID.getAll(termID);
        
        return new Promise((resolve) => {
            queryGetPostingByTermID.onsuccess = () => {
                const documentTermFrequencies = new Array();

                for(const posting of queryGetPostingByTermID.result) {
                    documentTermFrequencies.push({documentID: posting.documentID, termFrequency: posting.termFrequency});
                }

                resolve(documentTermFrequencies);
            }
        });
        
    }).then((documentTermFrequencies) => {
        // Score each document
        const transaction = db.transaction("Document", "readonly");
        const objectStoreDocument = transaction.objectStore("Document");

        const scorePromises = new Array();
        
        for(const documentTermFrequency of documentTermFrequencies) {
            const queryGetDocumentByID = objectStoreDocument.get(documentTermFrequency.documentID);

            const documentScorePromise = new Promise((resolve) => {
                queryGetDocumentByID.onsuccess = () => {
                    const score = okapiBM25(queryTermFrequency,
                        documentTermFrequency.termFrequency,
                        queryGetDocumentByID.result.length,
                        averageDocumentLength,
                        0.75,
                        1.2);

                    resolve({documentID: documentTermFrequency.documentID, score: score});
                }
            });

            scorePromises.push(documentScorePromise);
        }

        return Promise.all(scorePromises);

    }).then((scores) => {
        // Return the scores for this term
        return scores;

    }).catch(() => {
        // Return empty scores for the non-existent term
        return [];
    });
}

// Score a single query term against a document using Okapi BM25
function okapiBM25(countTermQuery, countTermDocument, documentLength, averageDocumentLength, b, k) {
    const numerator = countTermQuery * (k + 1) * countTermDocument;
    const denominator = countTermDocument + (k * (1 - b + (b * (documentLength / averageDocumentLength))));

    return numerator / denominator;
}

// Add a document to the document store
async function actionAddDocument(message, response) {
    // Remove the fragment from the URL
    const url = urlRemoveFragment(message.url);

    // Create variables to hold the database connection and transaction shared by the promise chain
    let db = null;
    let transaction = null;

    // Tokenize the page text into terms
    const terms = tokenizerEnglish.tokenize(message.text);

    return databaseOpen().then((dbHandle) => {
        db = dbHandle;
        transaction = db.transaction(["Document", "Dictionary", "Posting"], "readwrite");
        const objectStoreDocument = transaction.objectStore("Document");

        // Store the document metadata
        const newDocument = {
            title: message.title,
            length: terms.length,
            url: url,
            faviconURL: message.faviconURL,
            createdDateTime: new Date(),
            lastRetrievedDateTime: new Date()
        }

        const queryInsertDocument = objectStoreDocument.add(newDocument);

        return new Promise((resolve, reject) => {
            queryInsertDocument.onsuccess = () => {
                newDocument.id = queryInsertDocument.result
                response.document = newDocument;

                resolve(queryInsertDocument.result);
            }

            queryInsertDocument.onerror = (event) => {reject(event);};
        });

    }).then((newDocumentID) => {
        // Store the document's terms and postings to the inverted index
        const entries = termsToPostings(terms);
        const objectStoreDictionary = transaction.objectStore("Dictionary");
        const objectStorePosting = transaction.objectStore("Posting");

        const termPromises = new Array();

        for(const [term, posting] of entries) {
            // Get the current term from the dictionary if it exists
            const indexDictionaryTerm = objectStoreDictionary.index("Dictionary_term");
            const queryGetDictionaryTerm = indexDictionaryTerm.get(term);

            const termPromise = new Promise((resolve, reject) => {
                queryGetDictionaryTerm.onsuccess = () => {
                    // Add the term to the dictionary if it does not exist,
                    // or pdate the term if it does exist; create an entry
                    // in the posting store for the term-document pair
                    if(!queryGetDictionaryTerm.result)
                    {
                        // Add the new term to the dictionary
                        const queryInsertDictionary = objectStoreDictionary.add({
                            term: term,
                            documentFrequency: 1,
                            corpusFrequency: posting.termFrequency
                        });
    
                        queryInsertDictionary.onsuccess = () => {
                            // Add the posting entry
                            const queryInsertPosting = objectStorePosting.add({
                                termID: queryInsertDictionary.result,
                                documentID: newDocumentID,
                                termFrequency: posting.termFrequency,
                                posting: posting.positions
                            });

                            queryInsertPosting.onsuccess = () => {resolve();};
                            queryInsertPosting.onerror = (event) => {reject(event);};
                        };

                        queryInsertDictionary.onerror = (event) => {reject(event);};

                    } else {
                        // Update the existing term in the dictionary
                        const queryUpdateDictionary = objectStoreDictionary.put({
                            term: term,
                            documentFrequency: queryGetDictionaryTerm.result.documentFrequency + 1,
                            corpusFrequency: queryGetDictionaryTerm.result.corpusFrequency + posting.termFrequency,
                            id: queryGetDictionaryTerm.result.id
                        });

                        queryUpdateDictionary.onsuccess = () => {
                            // Add the posting entry
                            const queryInsertPosting = objectStorePosting.add({
                                termID: queryGetDictionaryTerm.result.id,
                                documentID: newDocumentID,
                                termFrequency: posting.termFrequency,
                                posting: posting.positions
                            });

                            queryInsertPosting.onsuccess = () => {resolve();};
                            queryInsertPosting.onerror = (event) => {reject(event);};
                        }

                        queryUpdateDictionary.onerror = (event) => {reject(event)};
                    }
                };
            });

            termPromises.push(termPromise);
        }

        return Promise.all(termPromises);

    }).then(() => {
        // The store was successful
        response.success = true;

    }).catch((error) => {
        // Remove the document from the response if it had been set prior to
        // the error
        delete response.document;

        // Return the error
        response.success = false;
        response.reason = error;
    });
}

// Remove a document from the document store
async function actionRemoveDocument(message, response) {
    // Create variables to hold the database connection and transaction shared by the promise chain
    let db = null;
    let transaction = null;

    return databaseOpen().then((dbHandle) => {
        // Delete the document
        db = dbHandle;
        transaction = db.transaction(["Posting", "Dictionary", "Document"], "readwrite");  
        const objectStoreDocument = transaction.objectStore("Document");

        // Delete the document
        const queryDeleteDocument = objectStoreDocument.delete(message.documentID);

        return new Promise((resolve, reject) => {
            queryDeleteDocument.onsuccess = () => {resolve();};
            queryDeleteDocument.onerror = (event) => {reject(event)};
        });

    }).then(() => {
        // Get the document's posting entries
        const objectStorePosting = transaction.objectStore("Posting");
        const indexPostingDocumentID = objectStorePosting.index("Posting_documentID");
        const queryGetPostingByDocumentID = indexPostingDocumentID.getAll(message.documentID);

        return new Promise((resolve) => {
            queryGetPostingByDocumentID.onsuccess = () => {
                resolve(queryGetPostingByDocumentID.result);
            };
        });

    }).then((postings) => {
        // Delete the document's posting entries and term if this was the only
        // document containing the term
        const objectStorePosting = transaction.objectStore("Posting");
        const objectStoreDictionary = transaction.objectStore("Dictionary");

        const termPromises = new Array();

        if(postings) {
            for(const posting of postings) {
                // Decrement the document frequency and subtract the
                // document's term frequency from the corpus frequency
                const queryGetDictionaryTerm = objectStoreDictionary.get(posting.termID);

                const termPromise = new Promise((resolve, reject) => {
                    queryGetDictionaryTerm.onsuccess = () => {
                        const promiseDictionary = new Promise((resolve, reject) => {
                            // If the current term's document frequency is greater
                            // than one, update it; otherwise, remove the term
                            // as this document is its only source
                            if(queryGetDictionaryTerm.result.documentFrequency > 1) {
                                const queryUpdateDictionaryTerm = objectStoreDictionary.put({
                                    term: queryGetDictionaryTerm.result.term,
                                    documentFrequency: queryGetDictionaryTerm.result.documentFrequency - 1,
                                    corpusFrequency: queryGetDictionaryTerm.result.corpusFrequency - posting.termFrequency,
                                    id: queryGetDictionaryTerm.result.id
                                });

                                queryUpdateDictionaryTerm.onsuccess = () => {resolve();};
                                queryUpdateDictionaryTerm.onerror = (event) => {reject(event);};
                            
                            } else {
                                const queryDeleteDictionaryTerm = objectStoreDictionary.delete(queryGetDictionaryTerm.result.id);
                                queryDeleteDictionaryTerm.onsuccess = () => {resolve();};
                                queryDeleteDictionaryTerm.onerror = (event) => {reject(event);};
                            }
                        });

                        const promisePosting = new Promise((resolve, reject) => {
                            // Delete the posting
                            const queryDeletePosting = objectStorePosting.delete([posting.termID, posting.documentID]);

                            queryDeletePosting.onsuccess = () => {resolve();};
                            queryDeletePosting.onerror = (event) => {reject(event);};
                        });

                        Promise.all([promiseDictionary, promisePosting]).then(() => {
                            resolve();

                        }).catch((event) => {
                            reject(event);
                        });
                    };
                });

                termPromises.push(termPromise);
            }
        }

        return Promise.all(termPromises);

    }).then(() => {
        // The removal was successful
        response.success = true;

    }).catch((error) => {
        // Return the error
        response.success = false;
        response.reason = error;
    });
}

// Query the document store
async function actionQuery(message, response) {
    // Process the query text through the tokenizer
    const queryTerms = tokenizerEnglish.tokenize(message.query);

    // Create a posting list of the query (we'll only use the term frequency 
    // component for BM25)
    const queryPosting = termsToPostings(queryTerms);

    return calculateAverageDocumentLength().then((averageDocumentLength) => {
        // Score the unique query terms against each document in the corpus
        // that contains a query term
        const scorerPromises = new Array();
        
        for(const [term, posting] of queryPosting) {
            const scorerPromise = new Promise((resolve) => {
                resolve(scoreTerm(term, posting.termFrequency, averageDocumentLength));
            });

            scorerPromises.push(scorerPromise);
        }

        return Promise.all(scorerPromises);
        
    }).then((termScores) => {
        // Sum the document scores for each unique term, sort the documents
        // be score, and retrieve the documents' associated metadata
        let documentScores = new Map();

        for(const termScore of termScores) {
            for(const documentTermScore of termScore) {
                let documentScore = documentScores.get(documentTermScore.documentID);

                if(!documentScore) {
                    documentScores.set(documentTermScore.documentID, 0);
                    documentScore = documentScores.get(documentTermScore.documentID);
                }

                documentScores.set(documentTermScore.documentID, documentScore + documentTermScore.score);
            }
        }

        return documentScores;

    }).then((documentScores) => {
        // Apply the collections filter if one was specified
        if(Array.isArray(message.collectionIDs) && message.collectionIDs.length > 0) {
            // Convert the collection IDs filter into a set for searching
            const collectionIDs = new Set(message?.collectionIDs);

            const filterPromises = new Array();

            for(const [documentID, score] of documentScores) {
                const documentCollectionsMessage = {documentID: documentID};
                const documentCollectionsResponse = {};
                
                const filterPromise = actionGetDocumentCollections(documentCollectionsMessage, documentCollectionsResponse).then(() => {
                    let documentMembershipCount = 0;

                    for(const documentCollection of documentCollectionsResponse.documentCollections) {
                        if(collectionIDs.has(documentCollection.collectionID)) {
                            ++documentMembershipCount;
                        }
                    }

                    if(documentMembershipCount > 0) {
                        // Reward documents that are members of more than one
                        // selected collections
                        const rewardedScore = score * (1 + Math.log10(1 + ((documentMembershipCount - 1) / 5)));

                        return [documentID, rewardedScore];
                    }
                });

                filterPromises.push(filterPromise);
            }

            return Promise.all(filterPromises).then((documentScores) => {
                return documentScores.filter(element => element);
            });
        
        } else {
            return [...documentScores];
        }

    }).then((documentScores) => {
        // Sort the scores in descending order
        documentScores = documentScores.sort((score1, score2) => {return score2[1] - score1[1];});

        // Determine a document set relevancy score to present to the user
        const scoreFloor = 0;
        let scoreCeiling = 0;

        if(documentScores.length > 0) {
            scoreCeiling = documentScores[0][1];
        }

        // If a limit was provided, truncate the score list
        if(message.limit && Number.isInteger(message.limit) && message.limit > 0) {
            documentScores = documentScores.slice(0, message.limit);
        }

        // Retrieve the documents' associated metadata
        const messageGetDocuments = {documentIDs: documentScores.map(element => element[0])};
        const responseGetDocuments = {};
        return actionGetDocuments(messageGetDocuments, responseGetDocuments).then(() => {
            let currentIndex = 0;

            for(const document of responseGetDocuments.documents) {
                if(document) {
                    document.score = documentScores[currentIndex][1];

                    if(documentScores.length > 0) {
                        document.relevance = Math.round(((document.score - scoreFloor) / scoreCeiling) * 10000) / 100;
                    }
                }

                ++currentIndex;
            }

            response.success = true;
            response.documents = responseGetDocuments.documents;
        });

    }).catch((error) => {
        // Return the error
        response.success = false;
        response.reason = error;
    });
}

// Get all documents currently stored in the database
async function actionGetDocuments(message, response) {
    return databaseOpen().then((db) => {
        const transaction = db.transaction("Document", "readonly");
        const objectStoreDocument = transaction.objectStore("Document");

        if(Array.isArray(message?.documentIDs)) {
            // Get the specified documents by document ID
            const documentPromises = new Array();

            for(const documentID of message.documentIDs) {
                const queryGetDocument = objectStoreDocument.get(documentID);

                const documentPromise = new Promise((resolve) => {
                    queryGetDocument.onsuccess = () => {resolve(queryGetDocument.result);};
                });

                documentPromises.push(documentPromise);
            }

            return Promise.all(documentPromises).then((documents) => {
                response.success = true;
                response.documents = documents;
            });

        } else {
            // Get all documents
            const queryGetDocument = objectStoreDocument.getAll();

            return new Promise((resolve) => {
                queryGetDocument.onsuccess = () => {  
                    response.success = true;
                    response.documents = queryGetDocument.result;

                    resolve();
                };
            });
        }
    });
}

// Get the document from the database by the specified URL if it exists
async function actionGetDocumentByURL(message, response) {
    // Remove the fragment part of the URL
    const url = urlRemoveFragment(message.url);
    
    return databaseOpen().then((db) => {
        // Retrieve the document specified by the fragment-stripped URL
        const transaction = db.transaction("Document", "readonly");
        const objectStoreDocument = transaction.objectStore("Document");
        const indexDocumentURL = objectStoreDocument.index("Document_url");
        const queryGetDocumentByURL = indexDocumentURL.get(url);

        return new Promise((resolve) => {
            queryGetDocumentByURL.onsuccess = () => {  
                // If the result is defined, the document exists in the database
                response.document = queryGetDocumentByURL.result;

                resolve();
            };
        });
    });
}

// Create a collection
async function actionCreateCollection(message, response) {
    // Create variables to hold the database connection and transaction shared by the promise chain
    let db = null;
    let transaction = null;

    return databaseOpen().then((dbHandle) => {
        db = dbHandle;
        transaction = db.transaction("Collection", "readwrite");
        const objectStoreCollection = transaction.objectStore("Collection");

        // Store the collection
        const collection = {name: message.name}

        const queryInsertCollection = objectStoreCollection.add(collection);

        return new Promise((resolve, reject) => {
            queryInsertCollection.onsuccess = () => {
                collection.id = queryInsertCollection.result
                response.collection = collection;

                resolve();
            };

            queryInsertCollection.onerror = (event) => {reject(event);};
        });

    }).then(() => {
        // The store was successful
        response.success = true;

    }).catch((error) => {
        // Return the error
        response.success = false;
        response.reason = error;
    });
}

// Rename a collection
async function actionRenameCollection(message, response) {
    return databaseOpen().then((db) => {
        // Rename the collection
        const transaction = db.transaction("Collection", "readwrite");
        const objectStoreCollection = transaction.objectStore("Collection");

        const queryRenameCollection = objectStoreCollection.put({name: message.name, id: message.id});

        return new Promise((resolve, reject) => {
            queryRenameCollection.onsuccess = () => {resolve();};
            queryRenameCollection.onerror = (event) => {reject(event);};
        });
    
    }).then(() => {
        // The rename was successful
        response.success = true;

    }).catch((error) => {
        // Return the error
        response.success = false;
        response.reason = error;
    });
}

// Delete a collection
async function actionDeleteCollection(message, response) {
    // Create variables to hold the database connection and transaction shared by the promise chain
    let db = null;
    let transaction = null;

    return databaseOpen().then((dbHandle) => {
        // Delete the collection
        db = dbHandle;
        transaction = db.transaction(["Collection", "DocumentCollection"], "readwrite");
        const objectStoreCollection = transaction.objectStore("Collection");

        const queryDeleteCollection = objectStoreCollection.delete(message.collectionID);

        return new Promise((resolve, reject) => {
            queryDeleteCollection.onsuccess = () => {resolve();};
            queryDeleteCollection.onerror = (event) => {reject(event);};
        });

    }).then(() => {
        // Get the collection's document mappings
        const objectStoreDocumentCollection = transaction.objectStore("DocumentCollection");
        const indexDocumentCollectionDocumentID = objectStoreDocumentCollection.index("DocumentCollection_collectionID");
        const queryDocumentCollectionDocumentID = indexDocumentCollectionDocumentID.getAll(message.collectionID);

        return new Promise((resolve) => {
            queryDocumentCollectionDocumentID.onsuccess = () => {
                resolve(queryDocumentCollectionDocumentID.result);
            };
        });

    }).then((documentCollections) => {
        // Delete the collection's document mappings
        const objectStoreDocumentCollection = transaction.objectStore("DocumentCollection");

        const documentCollectionPromises = new Array();

        if(documentCollections) {
            for(const documentCollection of documentCollections) {
                // Delete the mapping
                const queryDeleteDocumentCollection = objectStoreDocumentCollection.delete([
                    documentCollection.documentID,
                    documentCollection.collectionID
                ]);
                
                const documentCollectionPromise = new Promise((resolve) => {
                    queryDeleteDocumentCollection.onsuccess = () => {resolve();}
                    queryDeleteDocumentCollection.onerror = (event) => {reject(event);};
                });

                documentCollectionPromises.push(documentCollectionPromise);
            }
        }

        return Promise.all(documentCollectionPromises);

    }).then(() => {
        // The deletion was successful
        response.success = true;

    }).catch((error) => {
        // Return the error
        response.success = false;
        response.reason = error;
    });
}

// Get all collections currently stored in the database
async function actionGetCollections(message, response) {
    return databaseOpen().then((db) => {
        const transaction = db.transaction("Collection", "readonly");
        const objectStoreCollection = transaction.objectStore("Collection");

        if(Array.isArray(message?.collectionIDs)) {
            // Get the specified collections by collection ID
            const collectionPromises = new Array();

            for(const collectionID of message.collectionIDs) {
                const queryGetCollection = objectStoreCollection.get(collectionID);

                const collectionPromise = new Promise((resolve) => {
                    queryGetCollection.onsuccess = () => {resolve(queryGetCollection.result);};
                });

                collectionPromises.push(collectionPromise);
            }

            return Promise.all(collectionPromises).then((collections) => {
                response.success = true;
                response.collections = collections;
            });

        } else {
            // Get all collections
            const queryGetCollection = objectStoreCollection.getAll();

            return new Promise((resolve) => {
                queryGetCollection.onsuccess = () => {  
                    response.success = true;
                    response.collections = queryGetCollection.result;

                    resolve();
                };
            });
        }
    });
}

// Get all collections associated with the specified document
async function actionGetDocumentCollections(message, response) {
    return databaseOpen().then((db) => {
        const transaction = db.transaction("DocumentCollection", "readonly");
        const objectStoreDocumentCollection = transaction.objectStore("DocumentCollection");
        const indexDCDocumentID = objectStoreDocumentCollection.index("DocumentCollection_documentID");

        if(Array.isArray(message?.documentIDs)) {
            // Get the specified collections by collection ID
            const collectionPromises = new Array();

            for(const documentID of message.documentIDs) {
                const queryGetDocumentCollections = indexDCDocumentID.getAll(documentID);

                const collectionPromise = new Promise((resolve) => {
                    queryGetDocumentCollections.onsuccess = () => {
                        resolve(queryGetDocumentCollections.result);
                    };
                });

                collectionPromises.push(collectionPromise);
            }

            return Promise.all(collectionPromises).then((documentCollections) => {
                response.success = true;
                response.documentCollections = documentCollections;
            });

        } else {
            // Get collections by associated document ID
            const queryGetDocumentCollections = indexDCDocumentID.getAll(message.documentID);

            return new Promise((resolve) => {
                queryGetDocumentCollections.onsuccess = () => {  
                    response.success = true;
                    response.documentCollections = queryGetDocumentCollections.result;

                    resolve();
                };
            });
        }
    });
}

// Get all collections associated with the specified document
async function actionUpdateDocumentCollections(message, response) {
    // Create variables to hold the database connection and transaction shared by the promise chain
    let db = null;
    let transaction = null;

    return databaseOpen().then((dbHandle) => {
        // Get the existing collection memberships for this document
        db = dbHandle;
        const response = {};

        return actionGetDocumentCollections({documentID: message.documentID}, response).then(() => {
            return response.documentCollections;
        });

    }).then((documentCollections) => {
        // Delete existing collection memberships for this document
        transaction = db.transaction("DocumentCollection", "readwrite");
        const objectStoreDocumentCollection = transaction.objectStore("DocumentCollection");

        const documentCollectionPromises = new Array();

        for(const documentCollection of documentCollections) {
            const queryDeleteDocumentCollection = objectStoreDocumentCollection.delete([
                documentCollection.documentID, 
                documentCollection.collectionID
            ]);
        
            const documentCollectionPromise = new Promise((resolve, reject) => {
                queryDeleteDocumentCollection.onsuccess = () => {resolve();};
                queryDeleteDocumentCollection.onerror = (event) => {reject(event);};
            });

            documentCollectionPromises.push(documentCollectionPromise);
        }

        return Promise.all(documentCollectionPromises);

    }).then(() => {
        // Create the specified collection memeberships
        const objectStoreDocumentCollection = transaction.objectStore("DocumentCollection");

        const documentCollectionPromises = new Array();

        for(const collectionID of message.collectionIDs) {
            const queryInsertDocumentCollection = objectStoreDocumentCollection.add({
                documentID: message.documentID,
                collectionID: collectionID
            });

            const documentCollectionPromise = new Promise((resolve, reject) => {
                queryInsertDocumentCollection.onsuccess = () => {resolve();};
                queryInsertDocumentCollection.onerror = (event) => {reject(event);};
            });

            documentCollectionPromises.push(documentCollectionPromise);
        }

        return Promise.all(documentCollectionPromises);

    }).then(() => {
        // The store was successful
        response.success = true;

    }).catch((error) => {
        // Return the error
        response.success = false;
        response.reason = error;
    });
}

// Initialize a tokenizer for general English text
const tokenizerEnglish = new tokenizer.Tokenizer(tokenizer.tokenizerLatin, tokenizer.formatterLatin, tokenizer.stopwordsEnglish);

// Add a message listener for the service worker to process user requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const response = {action: message?.action};

    if (message?.action === "addDocument") {        
        actionAddDocument(message, response).then(() => {
            sendResponse(response);
        });

    } else if(message?.action === "removeDocument") { 
        actionRemoveDocument(message, response).then(() => {
            sendResponse(response);
        });

    } else if(message?.action === "query") {
        actionQuery(message, response).then(() => {
            sendResponse(response);
        });

    } else if(message?.action === "getDocuments") {
        actionGetDocuments(message, response).then(() => {
            sendResponse(response);
        });

    } else if(message?.action === "getDocumentByURL") {
        actionGetDocumentByURL(message, response).then(() => {
            sendResponse(response);
        });

    } else if(message?.action === "createCollection") {
        actionCreateCollection(message, response).then(() => {
            sendResponse(response);
        });

    } else if(message?.action === "renameCollection") {
        actionRenameCollection(message, response).then(() => {
            sendResponse(response);
        });

    } else if(message?.action === "deleteCollection") {
        actionDeleteCollection(message, response).then(() => {
            sendResponse(response);
        });

    } else if(message?.action === "getCollections") {
        actionGetCollections(message, response).then(() => {
            sendResponse(response);
        });

    } else if(message?.action === "getDocumentCollections") {
        actionGetDocumentCollections(message, response).then(() => {
            sendResponse(response);
        });

    } else if(message?.action === "updateDocumentCollections") {
        actionUpdateDocumentCollections(message, response).then(() => {
            sendResponse(response);
        });

    } else {
        // Invalid or undefined action
        sendResponse({success: false, reason: "Invalid action"});
    }

    // Return true to signal that the response will be returned asynchronously
    return true;
});

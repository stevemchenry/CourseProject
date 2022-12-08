/*
Author:     Steve McHenry
Project:    CS 410 Course Project
Date:       Fall 2022
*/

"use strict";

// Global data elements
let bookmarkCount = 0;
let collectionCount = 0;
const searchCollections = new Set();

// Core UI elements
const buttonThisPage = document.getElementById("buttonThisPage");
const buttonCreateCollection = document.getElementById("buttonCreateCollection");
const buttonSearchCollections = document.getElementById("buttonSearchCollections");

const tabControls = document.getElementById("tabControls");
const content = document.getElementById("content");

const bookmarksSummary = document.getElementById("bookmarksSummary");
const collectionsSummary = document.getElementById("collectionsSummary");
const searchForm = document.getElementById("searchForm");

// Refresh the "this page" button to reflect the bookmark state of the focused
// tab's page
function refreshButtonThisPageState() {
    chrome.tabs.query({active: true, lastFocusedWindow: true}).then((value) => {
        // Get the focused browser tab
        return value[0];
    
    }).then((value) => {
        // Ask the service worker if the tab's web page exists in the database
        const requestCurrentPage = {action: "getDocumentByURL", url: value.url};

        chrome.runtime.sendMessage(requestCurrentPage, (response) => {
            if(response.document) {
                // The tab's page exists; provide the user with the option to 
                // remove it
                setButtonThisPageRemove(response.document.id);

            } else {
                // The tab's page does not exist; provide the user with the
                // option to add it
                setButtonThisPageAdd();
            }
        });
    });
}

// Set the "this page" button to add the focused tab's page as a bookmark
function setButtonThisPageAdd() {
    buttonThisPage.value = "💾 Add This Page";
    buttonThisPage.addEventListener("click", addThisPage, {once: true});
    buttonThisPage.disabled = false;
}

// Set the "this page" button to remove the focused tab's page as a bookmark
function setButtonThisPageRemove(documentID) {
    buttonThisPage.value = "❌ Remove This Page";
    buttonThisPage.addEventListener("click", () => {removeThisPage(documentID);}, {once: true});
    buttonThisPage.disabled = false;
}

// Set the "this page" button to indicate that the button is unavailable due to
// an active request
function setButtonThisPageWorking() {
    buttonThisPage.disabled = true;
    buttonThisPage.value = "🔄 Working...";
}

// Switch the UI content to the tab clicked by the user
function switchToTab(tabControlElement, tabContentElement) {
    // Update the UI to indicate the selected tab
    tabControlElement.className = "tabControlSelected";

    // Set all other tabs' CSS to unselected
    for(const tabControl of tabControls.children) {
        if(tabControl !== tabControlElement) {
            tabControl.className = "";
        }
    }

    // Update the content section to display the selected tab and hide others
    tabContentElement.style.display = "inline";

    for(const tabContent of content.children) {
        if(tabContent !== tabContentElement) {
            tabContent.style.display = "none";
        }
    }
}

// Add the focused tab's page as a bookmark
function addThisPage() {
    chrome.tabs.query({active: true, lastFocusedWindow: true}).then((value) => {
        // Get the focused tab
        return value[0];

    }).then((value) => {
        setButtonThisPageWorking();

        // Request the service worker to add the focused tab's document
        const request = {action: "addDocument", title: value.title, url: value.url, faviconURL: value.favIconUrl};

        chrome.scripting.executeScript({target: {tabId: value.id}, function: () => {return document.body.innerText;}}, (content) => {
            // Append the page's title content to its text content
            request.text = content[0].result + " " + (value.title ? value.title : "");

            chrome.runtime.sendMessage(request, (response) => {
                // Update the UI
                if(response.success) {
                    addBookmarkToList(response.document);
                    ++bookmarkCount;
                    refreshBookmarksSummary();

                    setButtonThisPageRemove(response.document.id);

                } else {
                    setButtonThisPageAdd();
                }
            });
        });
    });
}

// Remove the specified document ID (typically the current tab's page) as a bookmark
function removeThisPage(documentID) {
    setButtonThisPageWorking();

    // Request the service worker to remove the specified document
    const request = {action: "removeDocument", documentID: documentID};

    chrome.runtime.sendMessage(request, (response) => {
        // Update the UI
        if(response.success) {
            document.getElementById("bookmarkDocumentID" + documentID).remove();
            --bookmarkCount;
            refreshBookmarksSummary();

            setButtonThisPageAdd();

        } else {
            setButtonThisPageRemove(documentID);
        }
    });
}

// Refresh the UI bookmarks summary
function refreshBookmarksSummary() {
    bookmarksSummary.innerText = "(" + bookmarkCount + " documents)";
}

// Refresh the UI bookmarks list (retrieve all from database)
function refreshBookmarks() {
    // Request the list of all documents from the service worker
    const requestDocuments = {action: "getDocuments"};

    chrome.runtime.sendMessage(requestDocuments, (response) => {
        bookmarkCount = response.documents?.length ? response?.documents.length : 0;

        // Update the document collection summary statistics
        refreshBookmarksSummary();
        
        // Add each document to the bookmark listing
        if(bookmarkCount > 0) {
            for(const document of response.documents) {
                addBookmarkToList(document);
            }
        }
    });
}

// Add the specified document to the UI bookmarks list
function addBookmarkToList(document) {
    // Create a new list item
    const newListItem = window.document.getElementById("bookmarksList").appendChild(window.document.createElement("li"));
    newListItem.id = "bookmarkDocumentID" + document.id;
    newListItem.title = document.url + "\n\nCreated: " + document.createdDateTime;

    // Create the list item bookmark container
    const bookmarkContainer = newListItem.appendChild(window.document.createElement("div"));

    // Create the favicon-title link container
    const linkContainer = bookmarkContainer.appendChild(window.document.createElement("div"));
    linkContainer.addEventListener("click", () => {
        chrome.tabs.create({
            url: document.url,
            active: false
        });
    });

    // If a favicon exists for this document, append it to the container
    if(document.faviconURL) {
        const newListItemFavicon = linkContainer.appendChild(window.document.createElement("img"))
        newListItemFavicon.src = document.faviconURL;
        newListItemFavicon.style = "width: 16px; height: 16px;";
    }

    // Append the document title to the container
    const newListItemTitle = linkContainer.appendChild(window.document.createElement("span"));
    const documentTitle = document?.title ? document.title : "[Untitled Document]";
    newListItemTitle.appendChild(window.document.createTextNode(documentTitle));

    // Append the document controls to the container
    const newListItemConstrols = bookmarkContainer.appendChild(window.document.createElement("div"));

    // Append the modify-bookmark-collection-membership control
    const controlModifyCollectionMembership = newListItemConstrols.appendChild(window.document.createElement("a"));
    controlModifyCollectionMembership.href = "#";
    controlModifyCollectionMembership.title = "Modify this bookmark's collection membership"
    controlModifyCollectionMembership.appendChild(window.document.createTextNode("📚"));
    controlModifyCollectionMembership.addEventListener("click", (event) => {
        displayBookmarkCollectionMembership(document.id, newListItem, controlModifyCollectionMembership)
    }, {once: true});

    // Append the delete-bookmark control
    const controlErase = newListItemConstrols.appendChild(window.document.createElement("a"));
    controlErase.href = "#";
    controlErase.title = "Delete this bookmark"
    controlErase.appendChild(window.document.createTextNode("❌"));
    controlErase.addEventListener("click", (event) => {
        removeBookmark(document.id, newListItem);
    }, {once: true});
}

// Remove the specified document as a bookmark and remove it from the UI
// bookmarks list
function removeBookmark(documentID, bookmarkListElement) {
    // Request the service worker remove the document from the database
    const request = {action: "removeDocument", documentID: documentID};

    chrome.runtime.sendMessage(request, (response) => {
        // Update the UI
        if(response.success) {
            bookmarkListElement.remove();
            --bookmarkCount;
            refreshBookmarksSummary();

            refreshButtonThisPageState();
        }
    });
}

// Update a bookmark's collection membership
function updateBookmarkCollectionMembership(documentID, collectionIDs, collectionMembershipContainer) {
    // Request the service worker remove the bookmark from the database
    const updateDocumentCollections = {
        action: "updateDocumentCollections", 
        documentID: documentID, 
        collectionIDs: collectionIDs
    };

    chrome.runtime.sendMessage(updateDocumentCollections, (response) => {
        // Update the UI
        collectionMembershipContainer.remove();
    });
}

// Display a bookmark's collection membership
function displayBookmarkCollectionMembership(documentID, bookmarkListItem, collectionButton) {
    // Request the collections of which this document is a member from the
    // service worker
    const requestDocumentCollections = {action: "getDocumentCollections", documentID: documentID};

    new Promise((resolve) => {
        chrome.runtime.sendMessage(requestDocumentCollections, (response) => {
            const membershipCollectionIDs = new Set();
    
            for(const documentCollection of response.documentCollections) {
                membershipCollectionIDs.add(documentCollection.collectionID);
            }
    
            resolve(membershipCollectionIDs);
        });

    }).then((membershipCollectionIDs) => {
        // Get the list of collections
        const requestCollections = {action: "getCollections"};

        chrome.runtime.sendMessage(requestCollections, (response) => {
            // Create the bookmark collection membership container
            const collectionMembershipContainer = bookmarkListItem.appendChild(document.createElement("div"));

            const fieldset = collectionMembershipContainer.appendChild(document.createElement("fieldset"));
            fieldset.appendChild(document.createElement("legend")).appendChild(document.createTextNode("Choose Collections"));
        
            const checkboxSetName = "membership_" + documentID.toString();

            if(response.collections) {
                for(const collection of response.collections) {
                    // Append the collection to the list
                    const collectionContainer = fieldset.appendChild(document.createElement("div"));

                    const collectionCheckbox = collectionContainer.appendChild(document.createElement("input"));
                    collectionCheckbox.type = "checkbox";
                    collectionCheckbox.value = collection.id.toString();
                    collectionCheckbox.name = checkboxSetName;
                    collectionCheckbox.id = "membership_" + documentID.toString() + "_" + collection.id.toString();

                    if(membershipCollectionIDs.has(collection.id)) {
                        collectionCheckbox.checked = true;
                    }

                    const collectionLabel = collectionContainer.appendChild(document.createElement("label"));
                    collectionLabel.appendChild(document.createTextNode(collection.name));
                    collectionLabel.htmlFor = collectionCheckbox.id;
                }
            }

            // Create the control section
            const membershipControls = fieldset.appendChild(document.createElement("div"));
            membershipControls.style.marginTop = "5px";

            // Append the save and close button
            const buttonSave = membershipControls.appendChild(document.createElement("input"));
            buttonSave.type = "button";
            buttonSave.value = "Save & Close";
            buttonSave.addEventListener("click", () => {
                const collectionIDs = new Array();

                for(const checkbox of document.getElementsByName(checkboxSetName)) {
                    if(checkbox.checked) {
                        collectionIDs.push(parseInt(checkbox.value));
                    }
                }

                updateBookmarkCollectionMembership(documentID, collectionIDs, collectionMembershipContainer);

                collectionButton.addEventListener("click", (event) => {
                    displayBookmarkCollectionMembership(documentID, bookmarkListItem, collectionButton)
                }, {once: true});
            });
        
            // Append the cancel button
            const buttonCancel = membershipControls.appendChild(document.createElement("input"));
            buttonCancel.type = "button";
            buttonCancel.value = "Cancel";
            buttonCancel.style.marginLeft = "5px";
            buttonCancel.addEventListener("click", () => {
                collectionMembershipContainer.remove();
        
                collectionButton.addEventListener("click", (event) => {
                    displayBookmarkCollectionMembership(documentID, bookmarkListItem, collectionButton)
                }, {once: true});
            });
        });
    });
}

// Create a new collection
function createCollection() {
    // Request the service worker create the new collection
    const collectionName = prompt("New collection name (must be unique)");

    if(collectionName) {
        const request = {action: "createCollection", name: collectionName};

        chrome.runtime.sendMessage(request, (response) => {

            // Update the UI
            if(response.success) {
                addCollectionToList(response.collection);
                ++collectionCount;
                refreshCollectionsSummary();
            
            } else {
                alert("Could not create the collection named \"" + collectionName + "\".\nEnsure that its name is unique.");
            }
        });
    }
}

// Rename the specified collection
function renameCollection(collectionID, collectionName, collectionListElement, collectionRenameElement) {
    // Prompt the user to enter an updated name for the collection
    let collectionNameCurrent = collectionName;
    const collectionNameNew = prompt("Rename collection (must be unique)", collectionName);

    if(collectionNameNew) {
        // Request the service worker update the collection's name
        const request = {action: "renameCollection", id: collectionID, name: collectionNameNew};

        chrome.runtime.sendMessage(request, (response) => {

            // Update the UI
            if(response.success) {
                collectionNameCurrent = collectionNameNew
                collectionListElement.firstChild.innerText = collectionNameCurrent; 

            } else {
                alert("Could not rename \"" + collectionName + "\" to \"" + collectionNameNew + "\".\nEnsure that its name is unique.");
            }
        });
    }

    // Re-add the click event listener to the rename button
    collectionRenameElement.addEventListener("click", (event) => {
        renameCollection(collectionID, 
            collectionNameCurrent, 
            collectionListElement, 
            collectionRenameElement);
    }, {once: true});
}

// Delete the specified collection
function deleteCollection(collectionID, collectionListElement) {
    // Request the service worker delete the collection
    const request = {action: "deleteCollection", collectionID: collectionID};

    chrome.runtime.sendMessage(request, (response) => {
        // Update the UI
        if(response.success) {
            collectionListElement.remove();
            --collectionCount;
            refreshCollectionsSummary();
        }
    });
}

// Refresh the UI collections summary
function refreshCollectionsSummary() {
    collectionsSummary.innerText = "(" + collectionCount + " collections)";
}

// Refresh the UI collections list (retrieve all from database)
function refreshCollections() {
    // Request all of the collections from the service worker
    const requestCollections = {action: "getCollections"};

    chrome.runtime.sendMessage(requestCollections, (response) => {
        collectionCount = response.collections?.length ? response?.collections.length : 0;

        // Update the document collection summary statistics
        refreshCollectionsSummary();
        
        // Add each document to the collection listing
        if(collectionCount > 0) {
            for(const collection of response.collections) {
                addCollectionToList(collection);
            }
        }
    });
}

function addCollectionToList(collection) {
    // Create a new collection list item
    const newListItem = document.getElementById("collectionsList").appendChild(document.createElement("li"));
    newListItem.id = "collectionID" + collection.id;

    // Create the collection container
    const collectionContainer = newListItem.appendChild(document.createElement("div"));

    // Append the collection name to the list item
    const containerName = collectionContainer.appendChild(window.document.createElement("div"));

    // Add the collection name to the container
    containerName.appendChild(document.createElement("span")).appendChild(document.createTextNode(collection.name));

    // Append the collection controls to the list item
    const newListItemControls = collectionContainer.appendChild(document.createElement("div"));

    // Rename collection control
    const controlRename = newListItemControls.appendChild(document.createElement("a"));
    controlRename.href = "#";
    controlRename.title = "Rename this collection"
    controlRename.appendChild(document.createTextNode("✏️"));
    controlRename.addEventListener("click", (event) => {
        renameCollection(collection.id, collection.name, collectionContainer, controlRename);
    }, {once: true});

    // Delete collection control
    const controlErase = newListItemControls.appendChild(document.createElement("a"));
    controlErase.href = "#";
    controlErase.title = "Delete this collection (associated bookmarks won't be deleted)"
    controlErase.appendChild(document.createTextNode("❌"));
    controlErase.addEventListener("click", (event) => {
        deleteCollection(collection.id, newListItem);
    }, {once: true});
}

// Display the collection filtering selection on the search form
function displaySearchFormCollections() {
    // Request all of the collections from the service worker
    const requestCollections = {action: "getCollections"};

    chrome.runtime.sendMessage(requestCollections, (response) => {
        const collectionFormContainer = searchForm.appendChild(document.createElement("div"));

        const fieldset = collectionFormContainer.appendChild(document.createElement("fieldset"));
        fieldset.appendChild(document.createElement("legend")).appendChild(document.createTextNode("Inclusive Collections Filter"));

        const checkboxSetName = "searchCollection";

        if(response.collections) {
            for(const collection of response.collections) {
                // Append the collection to the list
                const collectionContainer = fieldset.appendChild(document.createElement("div"));

                const collectionCheckbox = collectionContainer.appendChild(document.createElement("input"));
                collectionCheckbox.type = "checkbox";
                collectionCheckbox.value = collection.id.toString();
                collectionCheckbox.name = checkboxSetName;
                collectionCheckbox.id = checkboxSetName + collection.id.toString();

                if(searchCollections.has(collection.id)) {
                    collectionCheckbox.checked = true;
                }

                const collectionLabel = collectionContainer.appendChild(document.createElement("label"));
                collectionLabel.appendChild(document.createTextNode(collection.name));
                collectionLabel.htmlFor = collectionCheckbox.id;
            }
        }

        // Create the control section
        const membershipControls = fieldset.appendChild(document.createElement("div"));
        membershipControls.style.marginTop = "5px";

        // Append the apply button
        const buttonApply = membershipControls.appendChild(document.createElement("input"));
        buttonApply.type = "button";
        buttonApply.value = "Apply & Close";
        buttonApply.style.marginLeft = "5px";
        buttonApply.addEventListener("click", () => {
            // Store the IDs of the selected collections to be included in the
            // filter; note that an empty collections filter implies that all
            // collections (and documents with no associated collections) are
            // to be included in the search
            searchCollections.clear();

            for(const checkbox of document.getElementsByName(checkboxSetName)) {
                if(checkbox.checked) {
                    searchCollections.add(parseInt(checkbox.value));
                }
            }

            // Update the UI
            collectionFormContainer.remove();
    
            buttonSearchCollections.addEventListener("click", (event) => {
                displaySearchFormCollections();
            }, {once: true});
        });
    });
}

// Add a document to the search result list
function addSearchResult(document) {
    // Create a new search result list item
    const newListItem = window.document.getElementById("collectionSearchResults").appendChild(window.document.createElement("li"));
    newListItem.title = document.url + "\n\nCreated: " + document.createdDateTime;

    // Create the list item bookmark container
    const resultContainer = newListItem.appendChild(window.document.createElement("div"));

    // Create the favicon-title link container
    const linkContainer = resultContainer.appendChild(window.document.createElement("div"));
    linkContainer.addEventListener("click", () => {
        chrome.tabs.create({
            url: document.url,
            active: false
        });
    });

    // If a favicon exists for this document, append it to the list item
    if(document.faviconURL) {
        const newListItemFavicon = linkContainer.appendChild(window.document.createElement("img"))
        newListItemFavicon.src = document.faviconURL;
        newListItemFavicon.style = "width: 16px; height: 16px;";
    }

    // Append the document title to the list item
    const newListItemTitle = linkContainer.appendChild(window.document.createElement("span"));
    const documentTitle = document?.title ? document.title : "[Untitled Document]";
    newListItemTitle.appendChild(window.document.createTextNode(documentTitle));

    // Append the ranking container
    const rankingContainer = resultContainer.appendChild(window.document.createElement("div"));

    // Append the document relevance to the list item
    const newListItemRelevance = rankingContainer.appendChild(window.document.createElement("div"));
    newListItemRelevance.className = "relevance";
    newListItemRelevance.title = "Result set relevance";
    newListItemRelevance.style = percentToHSLColorBox(parseFloat(document.relevance) / 100);

    const resultRelevanceText = (document.relevance === 0 ? "~0" : document.relevance) + "%";
    const resultRelevance = window.document.createTextNode(resultRelevanceText);
    newListItemRelevance.appendChild(resultRelevance);
}

// Return colored bordered box CSS ranging in color from green (1.0) to red (0.0)
function percentToHSLColorBox(percent) {
    const hue = Math.floor(120 * percent);
    return "background-color: hsl(" + hue + ", 100%, 50%);"
        + "border: 1px solid hsl(" + hue + ", 100%, 20%);";
}

// Determine if the current page is indexed for the add/remove button
refreshButtonThisPageState();

// Refresh bookmarks UI
refreshBookmarks();

// Refresh the collections UI
refreshCollections();

// Set the new collection button event handler
buttonCreateCollection.addEventListener("click", () => {
    createCollection();
});

// Set the search form show collection button event handler
buttonSearchCollections.addEventListener("click", () => {
    displaySearchFormCollections();
}, {once: true});

// Set non-default handling on the search form
searchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    // Submit the user's query
    const request = {action: "query", 
        query: document.getElementById("searchText").value,
        collectionIDs: Array.from(searchCollections),
        limit: parseInt(document.getElementById("searchLimit").value)};

    chrome.runtime.sendMessage(request, (response) => {
        if(response.success) {
            const searchResultsElement = document.getElementById("collectionSearchResults");

            // Clear any existing results
            searchResultsElement.innerHTML = "";

            // Populate the results
            if(response.documents.length > 0) {
                for(const document of response.documents) {
                    addSearchResult(document);
                }

            } else {
                const newListItem = document.getElementById("collectionSearchResults").appendChild(window.document.createElement("li"));
                newListItem.appendChild(window.document.createTextNode("Your search didn't return any results. Perhaps try different search terms."));
            }

            // Show the results element if it is still hidden
            document.getElementById("searchResults").style.display = "inline";
        }
    });
});

// Set the tab controls' onclick event to switch to their respective tab
for(const tabControl of tabControls.children) {
    const tabControlID = tabControl?.id;

    if(tabControlID === "tabBookmarks") {
        tabControl.addEventListener("click", () => {switchToTab(tabControl, document.getElementById("bookmarks"));});

    } else if(tabControlID === "tabCollections") {
        tabControl.addEventListener("click", () => {switchToTab(tabControl, document.getElementById("collections"));});

    } else if(tabControlID === "tabSearch") {
        tabControl.addEventListener("click", () => {switchToTab(tabControl, document.getElementById("search"));});
    }
}
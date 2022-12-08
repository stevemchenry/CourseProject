/*
Author:     Steve McHenry
Project:    CS 410 Course Project
Date:       Fall 2022
*/

export class Tokenizer {
    constructor(tokenizer, formatter, stopwords) {
        this.tokenizer = tokenizer;
        this.formatter = formatter;
        this.stopwords = stopwords;

        // Validate parameters
        if (typeof (tokenizer) !== "function") {
            throw new TypeError("delimiter must be a string; received: " + typeof (tokenizer));
        }

        if ((typeof (formatter) !== "function") && (formatter !== null)) {
            throw new TypeError("formatter must be a function or null; received: " + typeof (formatter));
        }

        if (!Array.isArray(stopwords) && (stopwords !== null) && (stopwords !== undefined)) {
            throw new TypeError("stopwords must be an array or null or not provided; received: " + typeof (stopwords));
        }
    }

    tokenize(data) {
        // Data must be a string
        if (typeof (data) !== "string") {
            throw new Error("data must be a string");
        }

        // Execute the formatter if one was provided
        if (this.formatter) {
            data = this.formatter(data);
        }

        // Tokenize the data
        data = this.tokenizer(data);

        // Filter stopwords if a stopwords were provided
        if (this.stopwords) {
            data = data.filter((word) => { return !this.stopwords.includes(word) && (word.length !== 0); });
        }

        return data;
    }
}

// Perform pre-tokenization formatting for Latin-based text
export const formatterLatin = (data) => {
    // This formatter is sufficient for Latin-based languages
    // Convert to lowercase and remove ISO 8859-1 ("extended ASCII") punctuation and symbols with the following exceptions:
    // 1. Do not remove leading nor internal numeric grouping or decimal separators, i.e., ',' and '.'
    // 2. Do not remove internal apostrophes
    return data.toLowerCase()
        .replace(/[`~\!@#\$%\^&\*()\-_=\+[\]{}\\\|:;"<>/\?¡¢£¤¥¦§¨©ª«¬®¯°±²³´¶·¸¹º»¼½¾¿×÷]/g, ' ') // Remove all symbols from the ISO 8859-1 code page except for those handled specially below
        .replace(/[\.,](?!\d)/g, ' ') // Remove periods and commas that are neither leading nor internal to a group of digits 
        .replace(/'(?=\s)|(?<=\s)'/g, ' ') // Remove apostrophes that have a neighboring space (i.e., non-internal apostrophes)
        .replace(/\s+/g, ' '); // Collaspse spaces
}

// Tokenize a Latin-based string into words
export const tokenizerLatin = (data) => {
    // This tokenizer splits words over space delimiters, which is sufficient for Latin-based languages
    return data.split(' ');
}

// Basic English stop words; provided by: https://www.ranks.nl/stopwords
export const stopwordsEnglish = [
    "a", "about", "above", "after", "again", "against", "all", "am", "an", 
    "and", "any", "are", "aren't", "as", "at", "be", "because", "been", 
    "before", "being", "below", "between", "both", "but", "by", "can't", 
    "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", 
    "doing", "don't", "down", "during", "each", "few", "for", "from", 
    "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", 
    "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", 
    "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", 
    "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", 
    "me", "more", "most", "mustn't", "my", "myself", "no", "nor", "not", "of", 
    "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", 
    "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", 
    "should", "shouldn't", "so", "some", "such", "than", "that", "that's", 
    "the", "their", "theirs", "them", "themselves", "then", "there", "there's", 
    "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", 
    "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", 
    "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", 
    "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", 
    "why's", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", 
    "you're", "you've", "your", "yours", "yourself", "yourselves"];

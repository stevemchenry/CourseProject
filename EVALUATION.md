# Evaluation

## Method
The system was evaluated by constructing a reasonably-sized document corpus and performing, constructing sample queries and corresponding binary relavence judgements for each document (relevant or not relevant), executing the queries, and calculating the average percision at 10 of each result set.

In total, 200 documents were collected belonging to four broad categories:
- Geopolitical events
- Finance and stock market events
- Sports and entertainment events
- Information about US cities (specifically, New York, Boston, Chicago, Los Angeles)

From these categories, nine topic-based collections were derived:
- News
- Geopolitics
- Sports
- Finance
- Social Media
- Entertainment
- Informational
- Technology
- Education

The documents within the corpus share enough contextual overlap in different areas that the scorer has the opportunity to make mistakes, yet not so shallow or specific that queries have only clearly-defined, non-ambiguous positive results. The size of the corpus also allows a single human annotator such as myself the ability to create several relevence judgements across the entire set for multiple queries. In an ideal world, a much larger team would work annotate a much larger corpus for more accurate results.

Each document was assigned to one or more collections based upon my subjective judgements of the documents' primary topic coverage.

Queries were devised based upon topics within the corpus with a reasonable degree of representation; in the case of this corpus, they are related to current events, conflicts and controversies, and sports.

Positive documents - the documents expected from the query - were also subjectively selected by me. This emphasizes a key point: when a user subjectively assigns bookmarks to collections, we expect that a query that filters on those collections will perform better than one that does not filter. Therefore, for each query, we performed the query twice. Once with no filters, and then again with the subjectively chosen most relevant filters for each query. We calculate the average precision for both runs.

The file named `evaluation-corpus.txt` provides the URLs of the 200 documents that were loaded into the system. In the Queries and Results section, positive relevance judgements are provided as integer IDs corresponding to the line number of the document in the file (the first line in the file is line 1).

## Queries and Results

### Query 1
- Query: `stock market news`
- Positive documents: `[5, 51, 52, 53, 54, 55, 58, 59, 60, 80, 132, 135, 136, 176]`

#### No collection filters
- Top 10 ranked documents: `[135, 51, 54, 58, 176, 144, 123, 170, 177, 52]`
- Average precision at 10: `0.47`

#### Most relevant collection filters {News, Finance}
- Top 10 ranked documents: `[135, 51, 54, 58, 176, 144, 132, 52, 133, 53]`
- Average precision at 10: `0.54`

### Query 2
- Query: `ice hockey news`
- Positive documents: `[35, 36, 92, 93, 94, 95, 96, 97, 98, 99, 100]`

#### No collection filters
- Top 10 ranked documents: `[93, 47, 98, 45, 36, 49, 35, 92, 100, 99]`
- Average precision at 10: `0.44`

#### Most relevant collection filters {News, Sports}
- Top 10 ranked documents: `[93, 98, 47, 36, 45, 49, 35, 92, 100, 99]`
- Average precision at 10: `0.48`

### Query 3
- Query: `elon musk twitter`
- Positive documents: `[65, 83, 139, 141, 145, 199]`

#### No collection filters
- Top 10 ranked documents: `[83, 65, 141, 199, 139, 145, 172, 56, 15, 177]`
- Average precision at 10: `1.0`

#### Most relevant collection filters {Social Media, Technology}
- Top 10 ranked documents: `[199, 83, 65, 141, 139, 145, 172, 56, 177, 86]`
- Average precision at 10: `1.0`

### Query 4
- Query: `united states president joe biden`
- Positive documents: `[57, 81, 83, 86, 89, 177]`

#### No collection filters
- Top 10 ranked documents: `[73, 71, 72, 41, 86, 57, 16, 81, 82, 45]`
- Average precision at 10: `0.15`

#### Most relevant collection filters {News, Geopolitics}
- Top 10 ranked documents: `[73, 71, 16, 72, 86, 81, 82, 57, 174, 2]`
- Average precision at 10: `0.15`

#### Query 5
- Query `russia ukraine conflict`
- Positive documents: `[12, 90, 119, 163, 175]`

#### No collection filters
- Top 10 ranked documents: `[12, 90, 13, 119, 73, 175, 163, 160, 164, 165]`
- Average precision at 10: `0.83`

#### Most relevant collection filters {News, Geopolitics}
- Top 10 ranked documents: `[12, 90, 13, 119, 73, 175, 163, 160, 162, 84]`
- Average precision at 10: `0.83`

### Mean Average Precision
- No collection filters: `0.58`
- Most relevant collection filters: `0.60`

## Conclusion
It can be seen that the BM25 implementation performs well in most cases. It can also be seen that when a user's bookmark-to-collection assignments are consistent with their subjective expectation of query results, the scoring function performs even higher - as expected. For all queries, the collection-filtered queries scored equal to or greater than the non-collection-filtered queries. There were some low-scoring results, however. In particular, query 4 may have scored so poorly simply because the target result set was small, and the query terms were also quite common within this limited corpus. Again, a larger corpus collection and labelling effort would likely demonstrate improved query results.
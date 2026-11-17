---
name: specstream
description: Live web data engine for search and extraction. Use for fast, reliable web searching and page content extraction.
---

# SpecStream

Live web data engine for web search and content extraction.

## Setup

Set your API key:
```bash
export SPECSTREAM_API_KEY="your_key"
```

## Search

```bash
./search.js "query"                    # Basic search
./search.js "query" -n 10              # More results
```

## Extract Page Content

```bash
./extract.js https://example.com/article
```

Fetches a URL and extracts readable content as markdown.

## When to Use

- Fast web search for current information.
- Reliable content extraction from web pages.
- Large scale data gathering.

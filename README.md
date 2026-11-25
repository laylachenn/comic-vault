# Layla's Comic Vault

Track your comic collection. Search for any issue, save it with its cover, and see which issues of a series you're missing.

**Live:** https://laylas-comic-vault.vercel.app

## Features

- Search Comic Vine and add issues with their covers
- Search your collection by character, series or issue
- See every issue in a series, and which ones you're missing
- Look up any character and see every comic they've appeared in
- Key issues: first appearances are found and flagged automatically
- Story arcs in reading order, and a "read next" list for every series
- Stats, including how complete each run is
- "Do I own this?" barcode mode for shopping
- Want list, grades, prices, notes and tags
- Export your collection as a CSV file

## Run locally

1. Create a [Supabase](https://supabase.com) project and run `supabase/schema.sql` in its SQL Editor.
2. Get a free [Comic Vine API key](https://comicvine.gamespot.com/api/).
3. Copy `.env.local.example` to `.env.local` and fill in the values.
4. Start the site:

   ```bash
   npm install
   npm run dev
   ```

Built with Next.js and Supabase. Comic data and covers come from [Comic Vine](https://comicvine.gamespot.com).

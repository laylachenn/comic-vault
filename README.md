# 📚 layla's comic vault

a cozy little home for my comic collection ✨

**live →** https://laylas-comic-vault.vercel.app

## what it does

- 🔍 search comic vine and save issues with their covers
- 🗂️ see every issue in a series (and which ones i'm missing)
- 🦸 look up a character and find every comic they're in
- 🔑 first appearances get flagged as key issues automatically
- 📖 story arcs in reading order + a "read next" list
- 📊 stats on how complete each run is
- 📷 "do i own this?" barcode mode for comic shop trips
- 💭 want list, grades, prices, notes and tags
- 📤 export everything as a csv

## run it yourself

1. make a [supabase](https://supabase.com) project and run `supabase/schema.sql` in the sql editor
2. grab a free [comic vine api key](https://comicvine.gamespot.com/api/)
3. copy `.env.local.example` to `.env.local` and fill it in
4. then:

   ```bash
   npm install
   npm run dev
   ```

made with next.js + supabase 💌 comic data and covers from [comic vine](https://comicvine.gamespot.com)

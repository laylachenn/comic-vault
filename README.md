# Layla's Comic Vault

A website for keeping track of a comic collection. Search Comic Vine for a series, tap the issues you own, and each one is saved with its cover, characters and creators. Everyone who signs up gets their own private collection.

**What it does**
- Add comics by searching Comic Vine ("Scarlet Witch", "Avengers #16"), or by hand with your own cover photo
- Search your collection by character, series, issue, tag, notes and more
- Series pages show the full run from Comic Vine: what you own, what you're missing, and a progress bar
- Want list, "Got it!" to move a wanted issue into your collection
- Grade, slabbed, price paid, read/unread, where it's kept, tags, notes
- Download a backup as a .csv spreadsheet
- Works on phone and computer; add it to your phone's home screen

Built with Next.js, Supabase (sign-in, database, cover storage) and the Comic Vine API.

---

## Setup (about 15 minutes, all free)

### 1. Comic Vine API key
1. Make a free account at https://comicvine.gamespot.com
2. Go to https://comicvine.gamespot.com/api/ and copy your API key.

The key is for **non-commercial use only**: no ads, no charging people, no selling the app.

### 2. Supabase project
1. Sign up at https://supabase.com and create a new project (any name, pick a region near you, save the database password somewhere).
2. In the project, open **SQL Editor → New query**, paste everything in [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the `comics` table, the privacy rules (each person only sees their own comics) and the `covers` storage bucket.
3. Open **Project Settings → API** (or the **Connect** button) and copy the **Project URL** and the **anon / publishable key**.
4. Open **Authentication → URL Configuration** and set **Site URL** to `http://localhost:3000` for now (change it to your real web address when you deploy). Confirmation emails link back here.

### 3. Settings file
```bash
cp .env.local.example .env.local
```
Open `.env.local` and paste in the three values.

### 4. Run it
```bash
npm install
npm run dev
```
Open http://localhost:3000, click **Make an account**, confirm your email, and sign in.

**Try it on your phone** (same Wi‑Fi): run `npm run dev -- -H 0.0.0.0`, find your Mac's IP in System Settings → Wi‑Fi → Details, and open `http://<that-ip>:3000` on your phone.

---

## Putting it online (Vercel)
1. Put this folder on GitHub (a private repository is fine).
2. At https://vercel.com, sign in with GitHub, click **Add New → Project**, and pick the repository.
3. Under **Environment Variables**, add the same three values from `.env.local`.
4. Deploy. Vercel gives you an address like `comic-vault.vercel.app`.
5. Back in Supabase **Authentication → URL Configuration**, set **Site URL** to that address.

Send the address to friends: they make their own account and get their own vault.

---

## How it fits together
- `src/app/api/cv/*`: server routes that talk to Comic Vine. The API key only lives on the server, and answers are cached (a day for issues, an hour for searches) to stay inside Comic Vine's limit of about 200 requests per hour per kind of lookup.
- `src/app/api/collection/add`: looks up an issue, saves a copy of its cover into your storage folder, and adds it to your collection.
- `src/app/*/page.tsx`: the collection, add, series and comic pages.
- `supabase/schema.sql`: the database table, privacy rules and storage bucket.

Comic details and cover images come from Comic Vine; cover art belongs to its publishers. Every page links back to Comic Vine as its terms ask.

Node.js 22 or newer is recommended (20 works but Supabase is phasing out support).

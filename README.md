# Hashnode

Developer-first blogging and publishing platform built with the MERN stack.

## Stack

- React + Vite
- Express.js + Mongoose
- MongoDB
- Redis (available for future caching/rate limiting)
- JWT authentication and bcryptjs password hashing

## Run locally

1. Copy `.env.example` to `server/.env`.
2. Start dependencies:

   ```bash
   docker compose up -d
   ```

3. Install packages and start both applications:

   ```bash
   npm install
   npm run dev
   ```

- Web app: http://localhost:5173
- API: http://localhost:4000

The first registered account can immediately create drafts and published posts.

To enable image uploads, copy the Cloudinary values from `server/.env.example` into
`server/.env`. Without them, the editor continues to support cover image URLs.

## MVP routes

- Public feed, title search, tag filtering, post detail, tags, and author profiles
- Register, login, persisted JWT session, and logout
- Dashboard with draft/published posts
- Create, edit, publish, and delete owned posts
- Profile editing
- Markdown rendering with fenced-code syntax highlighting
- Likes, comments, follows, bookmarks, reading-time estimates, and paginated feeds
- Optional Cloudinary image uploads with URL fallback
- Smooth page, card, and button transitions

## Production build

```bash
npm run build
npm start
```

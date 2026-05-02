# GitHub OAuth Bot

Simple web application with GitHub OAuth authentication and a lightweight chatbot interface.

## Features

- GitHub OAuth login
- Fetch user repositories
- Chat endpoint with fallback intent logic
- Basic repo detail command
- Optional AI integration (with fallback if unavailable)

## Tech Stack

- Node.js
- Express
- GitHub API
- JWT authentication
- Optional OpenAI API

## Setup

1. Clone the repository

git clone https://github.com/your-username/your-repo.git
cd your-repo

2. Install dependencies

npm install

3. Create `.env` file

CLIENT_ID=your_github_client_id
CLIENT_SECRET=your_github_client_secret
JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=optional

4. Run the app

node app.js

## Usage

- Visit `/login` to authenticate with GitHub
- Go to `/bot` to interact with the app

### Example commands

ukaž moje repo
detail repo NAZEV_REPA

## Notes

- If OpenAI API is not configured or quota is exceeded, the app falls back to keyword-based intent detection.
- This project is designed as a learning project demonstrating OAuth, API integration, and basic chatbot logic.

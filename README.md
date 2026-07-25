# GlitrAI Mini Content Engine
URL-https://glitrai-mini-content-engine.onrender.com/
GlitrAI Mini Content Engine is an AI-powered web application that automates the process of generating creative marketing content for products. Users can upload a product image along with its name and description, and the system generates an AI-enhanced prompt and a corresponding creative image.
A simple AI-powered content generation application built for the GlitrAI SDE Intern Assignment.

## Features

- Generate AI prompts from product descriptions
- Upload product reference images
- Asynchronous job processing
- PostgreSQL database
- REST API with Express.js
- Simple frontend using HTML, CSS, and JavaScript

## Tech Stack

- Node.js
- Express.js
- PostgreSQL
- HTML, CSS, JavaScript
- Docker
- Groq API (LLM)

## Project Structure

```
glitrai-content-engine/
│── backend/
│── frontend/
│── comfyui/
│── docker-compose.yml
│── README.md
```

## Installation

### Clone Repository

```bash
git clone <repository-url>
cd glitrai-content-engine
```

### Install Dependencies

```bash
cd backend
npm install
```

### Configure Environment

Create a `.env` file inside the `backend` folder.

```env
PORT=4000
DATABASE_URL=your_database_url

LLM_PROVIDER=groq
LLM_API_KEY=your_api_key
LLM_MODEL=llama-3.1-8b-instant

IMAGE_GEN_MODE=freeapi
```

### Run the Application

```bash
npm run migrate
npm start
```

Open:

```
http://localhost:4000
```

Health Check:

```
http://localhost:4000/health
```

## API Endpoints

### Generate Content

```
POST /api/generate
```

### Get All Jobs

```
GET /api/jobs
```

### Get Job by ID

```
GET /api/jobs/:id
```

### Health Check

```
GET /health
```

## Deployment

The application can be deployed on:

- Render
- Railway
- Docker

## Author

**Mithun J**

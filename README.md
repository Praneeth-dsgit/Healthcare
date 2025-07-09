# Healthcare Chatbot

A modern healthcare chatbot application built with React and Flask, powered by the Llama and openai models.

## Features

- Real-time chat interface with AI-powered responses
- Medical knowledge base integration
- Rate limiting and API key authentication
- Docker containerization
- Comprehensive test coverage
- CI/CD pipeline with GitHub Actions

## Tech Stack

### Frontend
- React with TypeScript
- Vite for building
- Tailwind CSS for styling

### Backend
- Flask (Python)
- Transformers library with Llama model
- Docker containerization
- pytest for testing

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.9+
- Docker and Docker Compose (optional)

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/praneeth-dsgit/H_AI.git
cd healthcare-chatbot
```

2. Set up the backend:
```bash
cd api
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # Create and edit your .env file
```

3. Set up the frontend:
```bash
npm install
```

4. Start the development servers:

Backend:
```bash
cd api
flask run
```

Frontend:
```bash
npm run dev
```

### Docker Deployment

1. Build and run with Docker Compose:
```bash
docker-compose up --build
```

The application will be available at:
- Frontend: http://localhost:5173
- API: http://localhost:5000

## Environment Variables

### Backend (.env)
- `FLASK_ENV`: development/production
- `FLASK_DEBUG`: True/False
- `API_KEY`: Your API key
- `CORS_ORIGINS`: Allowed origins
- `MODEL_NAME`: Model identifier
- `MAX_TOKENS`: Maximum tokens for response
- See `.env.example` for all options

### Frontend
- `VITE_API_URL`: Backend API URL

## Testing

### Backend Tests
```bash
cd api
pytest tests/
```

### Frontend Tests
```bash
npm test
```

## API Documentation

### Endpoints

#### GET /api/health
Health check endpoint

Response:
```json
{
    "status": "healthy",
    "model": "HPAI-BSC/Llama3.1-Aloe-Beta-8B",
    "version": "1.0.0"
}
```

#### POST /api/chat
Chat endpoint (requires API key)

Request:
```json
{
    "message": "Your message here"
}
```

Headers:
```
Authorization: Bearer your_api_key
```

Response:
```json
{
    "response": "AI response",
    "timestamp": 1234567890
}
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

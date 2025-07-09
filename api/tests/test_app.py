import pytest
from app import app
import os
import json

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_health_check(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'status' in data
    assert 'model' in data
    assert 'version' in data

def test_chat_without_api_key(client):
    response = client.post('/api/chat', json={'message': 'test'})
    assert response.status_code == 401

def test_chat_with_invalid_api_key(client):
    response = client.post(
        '/api/chat',
        json={'message': 'test'},
        headers={'Authorization': 'Bearer invalid_key'}
    )
    assert response.status_code == 401

def test_chat_without_message(client):
    os.environ['API_KEY'] = 'test_key'
    response = client.post(
        '/api/chat',
        json={},
        headers={'Authorization': f'Bearer {os.environ["API_KEY"]}'}
    )
    assert response.status_code == 400
    data = json.loads(response.data)
    assert data['error'] == 'Message is required'

def test_chat_message_too_long(client):
    os.environ['API_KEY'] = 'test_key'
    response = client.post(
        '/api/chat',
        json={'message': 'x' * 1001},
        headers={'Authorization': f'Bearer {os.environ["API_KEY"]}'}
    )
    assert response.status_code == 400
    data = json.loads(response.data)
    assert data['error'] == 'Message too long' 
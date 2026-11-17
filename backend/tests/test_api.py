import os
os.environ.setdefault('VOCAL_BRIDGE_API_KEY','test-key')
os.environ.setdefault('VOCAL_BRIDGE_AGENT_ID','test-agent')
from fastapi.testclient import TestClient
from app import main
import httpx
import pytest

client=TestClient(main.app)

def test_health():
    response=client.get('/api/health');assert response.status_code==200;assert response.json()['status']=='ok'

def test_request_validation():
    response=client.post('/api/voice-token',json={'participant_name':''});assert response.status_code==422

def test_unconfigured(monkeypatch):
    monkeypatch.setattr(main,'API_KEY','');assert client.post('/api/voice-token',json={}).status_code==503

def test_rate_limit(monkeypatch):
    monkeypatch.setattr(main,'RATE_LIMIT',0);assert client.post('/api/voice-token',json={}).status_code==429

@pytest.mark.asyncio
async def test_upstream_success(monkeypatch):
    main.requests_by_ip.clear()
    class FakeClient:
        async def __aenter__(self):return self
        async def __aexit__(self,*a):pass
        async def post(self,url,headers,json):
            assert headers['X-Agent-Id']=='test-agent'
            return httpx.Response(200,json={'livekit_url':'wss://example.test','token':'jwt-test','room_name':'game-room'},request=httpx.Request('POST',url))
    monkeypatch.setattr(main.httpx,'AsyncClient',lambda **kwargs:FakeClient())
    response=client.post('/api/voice-token',json={'participant_name':'Tester'})
    assert response.status_code==200
    assert response.json()['url']=='wss://example.test'
    assert response.json()['room_name']=='game-room'
    assert 'test-key' not in response.text

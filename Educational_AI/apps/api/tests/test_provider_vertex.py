from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.domain.models import GenerationConfig

# Make sure vertexai SDK is mockable before importing the provider
# We will patch them heavily during tests.
with patch("app.providers.google_vertex.vertexai"):
    with patch("app.providers.google_vertex.GenerativeModel"):
        with patch("app.providers.google_vertex.TextEmbeddingModel"):
            from app.providers.google_vertex import GoogleVertexProvider

@pytest.fixture
def mock_vertex():
    with patch("app.providers.google_vertex.vertexai") as mock_v, \
         patch("app.providers.google_vertex.GenerativeModel") as mock_gm, \
         patch("app.providers.google_vertex.TextEmbeddingModel") as mock_tem:
        yield mock_v, mock_gm, mock_tem

@pytest.mark.asyncio
async def test_vertex_provider_initialization(mock_vertex):
    mock_v, mock_gm, mock_tem = mock_vertex
    provider = GoogleVertexProvider(
        project="test-proj",
        location="us-central1",
        model="gemini-1.5-pro",
        embedding_model="text-embedding-004",
    )
    
    mock_v.init.assert_called_once_with(project="test-proj", location="us-central1")
    mock_gm.assert_called_once_with("gemini-1.5-pro")
    mock_tem.from_pretrained.assert_called_once_with("text-embedding-004")

@pytest.mark.asyncio
async def test_vertex_generate(mock_vertex):
    mock_v, mock_gm, mock_tem = mock_vertex
    
    # Setup mock response
    mock_response = MagicMock()
    mock_response.text = '{"answer": "test"}'
    
    mock_model_instance = MagicMock()
    mock_model_instance.generate_content_async = AsyncMock(return_value=mock_response)
    mock_gm.return_value = mock_model_instance
    
    provider = GoogleVertexProvider(
        project="test-proj",
        location="us-central1",
        model="gemini-1.5-pro",
        embedding_model="text-embedding-004",
    )
    config = GenerationConfig(temperature=0.7, max_tokens=100, response_format="json_object")
    
    response = await provider.generate(prompt="Hello", context=[], config=config)
    
    assert response.content == '{"answer": "test"}'
    mock_model_instance.generate_content_async.assert_called_once()
    
    call_args = mock_model_instance.generate_content_async.call_args
    assert "Hello" in str(call_args)

@pytest.mark.asyncio
async def test_vertex_generate_with_context(mock_vertex):
    mock_v, mock_gm, mock_tem = mock_vertex
    
    mock_response = MagicMock()
    mock_response.text = "test output"
    
    mock_model_instance = MagicMock()
    mock_model_instance.generate_content_async = AsyncMock(return_value=mock_response)
    mock_gm.return_value = mock_model_instance
    
    provider = GoogleVertexProvider(
        project="test-proj",
        location="us-central1",
        model="gemini-1.5-pro",
        embedding_model="text-embedding-004",
    )
    config = GenerationConfig()
    
    class FakeEvidence:
        def __init__(self, c_id, title, text):
            self.chunk_id = c_id
            self.source_title = title
            self.content = text

    context = [FakeEvidence("chunkA", "Lecture Notes", "Some text chunk A")]
    
    response = await provider.generate(prompt="Ask question", context=context, config=config)
    
    assert response.content == "test output"
    call_args = mock_model_instance.generate_content_async.call_args
    # Context should be mapped into the prompt via formatting
    assert "chunkA" in str(call_args)
    assert "Some text chunk A" in str(call_args)

@pytest.mark.asyncio
async def test_vertex_embed(mock_vertex):
    mock_v, mock_gm, mock_tem = mock_vertex
    
    mock_emb_1 = MagicMock()
    mock_emb_1.values = [0.1, 0.2, 0.3]
    mock_emb_2 = MagicMock()
    mock_emb_2.values = [0.4, 0.5, 0.6]
    
    mock_tem_instance = MagicMock()
    mock_tem_instance.get_embeddings_async = AsyncMock(return_value=[mock_emb_1, mock_emb_2])
    mock_tem.from_pretrained.return_value = mock_tem_instance
    
    provider = GoogleVertexProvider(
        project="pos",
        location="loc",
        model="gemini-1.5-pro",
        embedding_model="text-embedding-004",
    )
    
    embeddings = await provider.embed(["text1", "text2"])
    
    assert len(embeddings) == 2
    assert embeddings[0] == [0.1, 0.2, 0.3]
    assert embeddings[1] == [0.4, 0.5, 0.6]
    mock_tem_instance.get_embeddings_async.assert_called_once_with(["text1", "text2"])

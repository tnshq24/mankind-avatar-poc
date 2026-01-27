import { OpenAIClient, AzureKeyCredential } from '@azure/openai';

let client = null;

function getClient() {
  if (!client) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    
    if (!endpoint || !apiKey) {
      throw new Error('Azure OpenAI credentials not configured');
    }

    client = new OpenAIClient(
      endpoint,
      new AzureKeyCredential(apiKey)
    );
  }
  return client;
}

export async function getChatResponse(message, language = 'en') {
  try {
    const client = getClient();
    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';
    const normalizedLanguage = language === 'hi' ? 'hi' : 'en';
    const systemPrompt = normalizedLanguage === 'hi'
      ? 'You are a helpful, concise assistant. Respond only in Hindi using Devanagari script.'
      : 'You are a helpful, concise English-speaking assistant. Respond only in English.';
    
    const response = await client.getChatCompletions(
      deploymentName,
      [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: message
        }
      ],
      {
        maxTokens: 200,
        temperature: 0.7
      }
    );

    // Extract the response text
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    return content;
  } catch (error) {
    console.error('Error calling Azure OpenAI:', error);
    throw error;
  }
}

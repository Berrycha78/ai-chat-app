import { NextResponse } from 'next/server';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required.' }, { status: 400 });
    }

    const apiKey = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL || 'gpt-4o-mini';

    if (!apiKey) {
      return NextResponse.json({ error: 'AI_API_KEY is not configured.' }, { status: 500 });
    }

    const upstream = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        stream: true
      })
    });

    if (!upstream.ok || !upstream.body) {
      const errorText = await upstream.text();
      return NextResponse.json(
        { error: 'The AI provider rejected the request.', details: errorText.slice(0, 500) },
        { status: upstream.status || 500 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';

            for (const part of parts) {
              const trimmed = part.trim();
              if (!trimmed.startsWith('data:')) continue;

              const payload = trimmed.replace(/^data:\s*/, '').trim();
              if (!payload || payload === '[DONE]') continue;

              try {
                const parsed = JSON.parse(payload);
                const content = parsed.choices?.[0]?.delta?.content ?? '';
                if (content) {
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`)
                  );
                }
              } catch {
                // Ignore malformed stream chunks.
              }
            }
          }

          if (buffer.trim()) {
            const payload = buffer.trim().replace(/^data:\s*/, '');
            if (payload && payload !== '[DONE]') {
              try {
                const parsed = JSON.parse(payload);
                const content = parsed.choices?.[0]?.delta?.content ?? '';
                if (content) {
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`)
                  );
                }
              } catch {
                // Ignore malformed buffer tails.
              }
            }
          }
        } catch (error) {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ error: 'Streaming interrupted.' })}\n\n`)
          );
        } finally {
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text, language } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      );
    }

    // ElevenLabs의 한국어 지원 음성 ID
    // 'pNInz6obpgDQGcFmaJgB' - Adam (다국어 지원, 전문적)
    // 'ThT5KcBeYPX3keUQqHPh' - Dorothy (여성, 차분함)
    const voiceId = language === 'ko' 
      ? 'pNInz6obpgDQGcFmaJgB' // Adam - 남성, 뉴스 아나운서 스타일
      : 'pNInz6obpgDQGcFmaJgB';

    // ElevenLabs TTS API 호출
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2', // 한국어 지원 모델
          voice_settings: {
            stability: 0.5, // 0-1: 높을수록 안정적, 낮을수록 감정 풍부
            similarity_boost: 0.75, // 0-1: 원본 음성과의 유사도
            style: 0.5, // 0-1: 스타일 강도 (v2 모델)
            use_speaker_boost: true, // 음성 명확도 향상
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs API Error:', error);
      return NextResponse.json(
        { error: 'TTS generation failed' },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(audioBuffer);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('TTS Error:', error);
    return NextResponse.json(
      { error: error.message || 'TTS generation failed' },
      { status: 500 }
    );
  }
}

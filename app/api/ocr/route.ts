import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    const simulateBlurry = formData.get('simulate_blurry') === 'true';

    // 1. Simulation for blurry image testing
    if (simulateBlurry) {
      return NextResponse.json({
        success: false,
        error_type: 'UNCLEAR_IMAGE',
        message: "We couldn't clearly read your Student ID. Please upload a clearer photo with good lighting and visible text.",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // 2. Error if API key is not configured (no silent mock fallback)
    if (!apiKey || apiKey.trim() === '') {
      console.warn('⚠️ [API/OCR] GEMINI_API_KEY is not configured in environment variables.');
      return NextResponse.json(
        {
          success: false,
          error_type: 'CONFIGURATION_ERROR',
          message: 'Student ID OCR service is not configured. Please ensure GEMINI_API_KEY is set in environment settings.',
        },
        { status: 503 }
      );
    }

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error_type: 'NO_FILE',
          message: 'Please choose or capture a photo of your University Student ID.',
        },
        { status: 400 }
      );
    }

    // Convert file to base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Data = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
You are a strict Student Identity Verification OCR assistant for Sri Lankan university student identity cards (specifically University of Moratuwa - UoM, or other Sri Lankan universities).
Analyze this photo of a student Identity Card.

Your task:
1. Check if the image is a clear and legible photo of a student ID card:
- If the image is blurry, glaring, rotated, too low-resolution, not a student ID, or if the Index Number or Student Name cannot be confidently read, respond with:
{
  "is_readable": false,
  "reason": "The ID card is blurry or text is illegible."
}

2. If the image is clear and readable, extract the exact values:
{
  "is_readable": true,
  "username": "Full name or name with initials as written on the card",
  "index_no": "University Student Index Number or Registration Number (e.g. 210042A or 20/ENG/042)",
  "address": "Department, faculty, residence hall, or home address if visible, otherwise 'Katubedda, Moratuwa'"
}

Respond ONLY with valid JSON.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const responseText = response.text || '';
      console.log('🤖 [API/OCR] Gemini Raw Output:', responseText);

      const parsed = JSON.parse(responseText.trim());

      if (!parsed.is_readable || !parsed.index_no) {
        return NextResponse.json({
          success: false,
          error_type: 'UNCLEAR_IMAGE',
          message: parsed.reason || "We couldn't clearly read your Student ID. Please upload a clearer photo with good lighting and visible text.",
        });
      }

      return NextResponse.json({
        success: true,
        is_mock: false,
        data: {
          username: parsed.username ? parsed.username.trim() : 'University Student',
          index_no: parsed.index_no.trim().toUpperCase(),
          address: parsed.address ? parsed.address.trim() : 'Katubedda, Moratuwa',
        },
      });
    } catch (aiError: any) {
      console.warn('⚠️ [API/OCR] Gemini error:', aiError.message);
      return NextResponse.json({
        success: false,
        error_type: 'UNCLEAR_IMAGE',
        message: "We couldn't clearly read your Student ID. Please upload a clearer photo with good lighting and visible text.",
      });
    }
  } catch (error: any) {
    console.error('❌ [API/OCR] Server error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

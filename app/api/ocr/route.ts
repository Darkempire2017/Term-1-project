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

    // 2. Demo fallback if API key is not configured
    if (!apiKey || apiKey.trim() === '') {
      console.log('ℹ️ [API/OCR] GEMINI_API_KEY not configured. Returning valid UoM demo card.');
      return NextResponse.json({
        success: true,
        is_mock: true,
        data: {
          username: 'K. A. Nimal Perera',
          index_no: '210042A',
          address: 'Mora-Villa, Katubedda, Moratuwa',
        },
        message: 'Student ID successfully verified (Demo Mode).',
      });
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
You are a strict Student Identity Verification OCR assistant for the University of Moratuwa (UoM) in Sri Lanka.
Analyze this photo of a student Identity Card.

First, check if the image is clear and legible:
- If the image is blurry, glaring, rotated, too low-resolution, not a student ID, or if the Index Number or Student Name cannot be confidently read, respond with:
{
  "is_readable": false,
  "reason": "The ID card is blurry or text is illegible."
}

- If the image is clear and readable, extract the exact values:
{
  "is_readable": true,
  "username": "Full name or name with initials as written on the card",
  "index_no": "University Student Index Number (e.g. 210042A or 20/ENG/042)",
  "address": "Department, residence hall, or home address if visible, otherwise 'Katubedda, Moratuwa'"
}

Respond ONLY with valid JSON. Do not include markdown code blocks or additional text.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
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
      });

      const responseText = response.text || '';
      const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!parsed.is_readable || !parsed.index_no) {
        return NextResponse.json({
          success: false,
          error_type: 'UNCLEAR_IMAGE',
          message: "We couldn't clearly read your Student ID. Please upload a clearer photo with good lighting and visible text.",
        });
      }

      return NextResponse.json({
        success: true,
        is_mock: false,
        data: {
          username: parsed.username || 'K. A. Nimal Perera',
          index_no: parsed.index_no.trim().toUpperCase(),
          address: parsed.address || 'Katubedda, Moratuwa',
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

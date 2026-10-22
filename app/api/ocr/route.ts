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
You are an expert OCR assistant for Sri Lankan university student identity cards, specifically the University of Moratuwa (UoM).
Analyze this photo of a student Identity Card.

Orientation Handling:
- The photo may be taken in any orientation (horizontal landscape, vertical portrait, rotated 90 degrees sideways, or upside down).
- You MUST mentally rotate and read the text in whatever orientation it appears. Do NOT reject an image simply because it is rotated or sideways.

University of Moratuwa Card Layout:
- Line 1: Student Name with initials (e.g. 'JITHWIN P.K.D.R.', 'K. A. Nimal Perera')
- Line 2: Student Index Number (e.g. 6 digits followed by a capital letter such as '250312H', '210042A'). Inspect every digit carefully (distinguish between '5' and '3').
- Lines 3+: Student Address (e.g. street address, town, or department printed on the card)

Rejection Criteria:
- Only reject if the photo is NOT a student identity card, or if it is so heavily blurred, obstructed, or washed out with glare that the text cannot be deciphered.
- If rejected, respond with:
{
  "is_readable": false,
  "reason": "The ID card is blurry or text is illegible."
}

Extraction Format:
- If readable, extract the exact values:
{
  "is_readable": true,
  "username": "Full name or name with initials as written on the card",
  "index_no": "6 digits and uppercase letter (e.g. 250312H)",
  "address": "Full address printed on the card, or 'Katubedda, Moratuwa'"
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

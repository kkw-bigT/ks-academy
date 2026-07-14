// api/grade-math-essay.js
// 수학 서술형 풀이 과정 AI 분석 + 단원성취도평가 모드 (최대 6장 사진 지원)
import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    imageBase64, mimeType = 'image/jpeg', images = null,
    mode = 'single', problem = '', totalScore = 10,
    problemCount = 10,
  } = req.body;

  if (!imageBase64 && (!images || !images.length)) return res.status(400).json({ error: '이미지가 없습니다' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다' });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // 이미지 목록 구성 (다중 이미지 지원)
  const safeMime = m => ['image/jpeg','image/png','image/gif','image/webp'].includes(m) ? m : 'image/jpeg';
  const imgList = images && images.length
    ? images.map(img => ({ type: 'image', source: { type: 'base64', media_type: safeMime(img.mime), data: img.base64 } }))
    : [{ type: 'image', source: { type: 'base64', media_type: safeMime(mimeType), data: imageBase64 } }];

  const photoNote = imgList.length > 1 ? `(사진 ${imgList.length}장 — 순서대로 시험지입니다)` : '';

  // ── 단원성취도평가 모드 ────────────────────────────────────────────────
  if (mode === 'achievement') {
    const scorePerProblem = Math.round(totalScore / problemCount);

    const prompt = `당신은 한국 수학 학원 선생님입니다. 학생의 단원성취도평가 시험지 사진을 채점해주세요. ${photoNote}

총 문항 수: ${problemCount}문항
총 배점: ${totalScore}점 (문항당 약 ${scorePerProblem}점)

중요 지침:
- 글씨가 엉망이거나 불분명해도 수학적 맥락을 파악하여 최대한 읽어주세요
- 각 문항별로 정답 여부(O/X)를 판단하세요
- 틀린 문항은 오류 유형을 분류하세요
- 한국 중고등학생 수준에 맞게 평가하세요
- score, correctCount 값은 반드시 순수한 숫자만 (단위, 한글 절대 금지)

아래 JSON 형식으로만 응답 (다른 텍스트 없이):

{
  "transcription": "시험지에서 읽은 학생 답안 전체 (손글씨 그대로)",
  "problems": [
    {"number": 1, "isCorrect": true, "score": ${scorePerProblem}, "errorType": "", "note": ""},
    {"number": 2, "isCorrect": false, "score": 0, "errorType": "개념오류", "note": "부연 설명"}
  ],
  "correctCount": 8,
  "totalScore": 80,
  "errorSummary": "오류 유형 전체 요약 (한국어)",
  "feedback": "학생에게 전달할 피드백 (한국어, 잘한 점 먼저 후 개선점)"
}

problems 배열에 ${problemCount}개 문항 모두 포함.
errorType 허용값: "연산실수" | "개념오류" | "공식오류" | "부호실수" | "단위오류" | "논리오류" | "문제이해오류" | ""`;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: [...imgList, { type: 'text', text: prompt }] }],
      });

      const text = response.content[0].text.trim();
      let jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다');

      let result;
      try {
        result = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        throw new Error('JSON 파싱 실패: ' + parseErr.message);
      }

      result.correctCount = Number(result.correctCount) || 0;
      result.totalScore = Number(result.totalScore) || 0;
      return res.status(200).json(result);

    } catch (error) {
      console.error('Math achievement grade error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // ── 단일 서술형 모드 (기본) ───────────────────────────────────────────
  const problemNote = problem ? `문제: "${problem}"` : '문제 미제공 (풀이 과정만 분석)';
  const photoNoteSingle = imgList.length > 1 ? `(사진 ${imgList.length}장 — 순서대로 한 문제의 풀이 과정입니다)` : '';

  const prompt = `당신은 한국 수학 학원 선생님입니다. 학생의 손으로 쓴 수학 서술형 풀이 사진을 분석해주세요. ${photoNoteSingle}

${problemNote}
총 배점: ${totalScore}점

중요 지침:
- 글씨가 엉망이거나 불분명해도 수학적 맥락을 파악하여 최대한 읽어주세요
- 풀이 과정을 단계별로 분석하세요
- 연산 실수인지 개념 오류인지 구분하세요
- 한국 중고등학생 수준에 맞게 평가하세요
- 부분 점수를 공정하게 부여하세요
- score 값은 반드시 0~${totalScore} 사이의 순수한 숫자만 입력 (단위, 한글 절대 금지)

아래 JSON 형식으로만 응답 (다른 텍스트 없이):

{
  "transcription": "사진에서 읽은 풀이 과정 전체",
  "steps": [
    {"description": "1단계 설명 (한국어)", "correct": true, "errorType": ""},
    {"description": "2단계 설명 (한국어)", "correct": false, "errorType": "연산실수"}
  ],
  "score": 7,
  "scoreReason": "채점 근거 설명 (한국어)",
  "errorSummary": "오류 유약 (한국어)",
  "feedback": "학생에게 전달할 피드백 (한국어, 잘한 점 먼저 후 개선점)"
}

score 필드: ${totalScore}점 만점 중 부여할 점수를 0~${totalScore} 사이 정수로만 작성.
errorType 허용값: "연산실수" | "개념오류" | "공식오류" | "부호실수" | "단위오류" | "논리오류" | "문제이해오류" | ""`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: [...imgList, { type: 'text', text: prompt }] }],
    });

    const text = response.content[0].text.trim();
    let jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다');

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      const scoreMatch = jsonMatch[0].match(/"score"\s*:\s*(\d+)/);
      if (!scoreMatch) throw new Error('JSON 파싱 실패: ' + parseErr.message);
      const fixed = jsonMatch[0].replace(/"score"\s*:[^,}]+/, '"score": ' + scoreMatch[1]);
      result = JSON.parse(fixed);
    }

    result.score = Math.max(0, Math.min(Number(totalScore), Number(result.score) || 0));
    return res.status(200).json(result);

  } catch (error) {
    console.error('Math essay grade error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// api/grade-english.js
// 영어 채점 AI — 영작문 / 해석(번역) / 단어 3가지 모드 지원
import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    imageBase64,
    mimeType = 'image/jpeg',
    images = null,        // 다중 이미지 [{base64, mime}]
    topic = '',
    level = '중학교',
    mode = 'writing',
    aiFeedback = true,
  } = req.body;

  if (!imageBase64 && (!images || !images.length)) return res.status(400).json({ error: '이미지가 없습니다' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다' });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const levelNote = level === '고등학교' ? '고등학교 수준' : '중학교 수준';
  const feedbackLine = aiFeedback ? '"한국어 피드백 (잘한점 + 개선점)"' : '"(피드백 생략)"';

  // 이미지 목록 구성
  const safeMime = m => ['image/jpeg','image/png','image/gif','image/webp'].includes(m) ? m : 'image/jpeg';
  const imgList = images && images.length
    ? images.map(img => ({ type: 'image', source: { type: 'base64', media_type: safeMime(img.mime), data: img.base64 } }))
    : [{ type: 'image', source: { type: 'base64', media_type: safeMime(mimeType), data: imageBase64 } }];

  let prompt;

  if (mode === 'vocabulary') {
    prompt = `당신은 한국 영어학원 선생님입니다. 학생이 쓴 영어 단어 시험지 사진을 채점해주세요.
수준: ${levelNote}
${topic ? '범위: ' + topic : ''}
지침:
- 글씨가 엉망이거나 불분명해도 최대한 읽어주세요 (아이들 손글씨 기준).
- 철자가 틀리면 오답. 대소문자 무관. 동의어는 정답 허용.
- studentAnswer는 학생이 쓴 글자 그대로 옮겨주세요 (틀린 철자도 그대로).
- wrongParts: 틀린 철자 부분을 구체적으로 알려주세요 (예: "studing → studying").
JSON 형식으로만 응답:
{
  "results": [{"number": 1, "studentAnswer": "학생이 쓴 단어 그대로", "isCorrect": true, "wrongParts": []}],
  "correctCount": 맞은수,
  "totalCount": 전체수,
  "score": 0~100,
  "feedback": ${feedbackLine}
}`;
  } else if (mode === 'interpretation') {
    prompt = `당신은 한국 영어학원 선생님입니다. 학생이 쓴 영어→한글 해석(번역) 시험지 사진을 채점해주세요.
수준: ${levelNote}
${topic ? '지문/주제: ' + topic : ''}
지침:
- 글씨가 엉망이거나 불분명해도 최대한 읽어주세요 (아이들 손글씨 기준).
- 각 문항(번호)별로 학생이 쓴 해석을 그대로 옮기고, 맞는지 판단하세요.
- 의미가 정확히 전달되면 표현이 달라도 정답.
- isCorrect가 false일 때: wrongParts에 틀린 부분, correctTranslation에 정확한 해석만 써주세요.
- studentText: 학생이 쓴 해석 그대로 (틀린 표현도 그대로).
JSON 형식으로만 응답:
{
  "items": [
    {"number": 1, "studentText": "학생 해석 그대로", "isCorrect": true, "wrongParts": [], "correctTranslation": ""},
    {"number": 2, "studentText": "학생 해석 그대로", "isCorrect": false, "wrongParts": ["틀린 부분"], "correctTranslation": "정확한 해석"}
  ],
  "totalScore": 0~100,
  "feedback": ${feedbackLine}
}`;
  } else if (mode === 'fill_blank') {
    prompt = `당신은 한국 영어학원 선생님입니다. 학생이 쓴 영어 빈칸넣기 시험지 사진을 채점해주세요.
수준: ${levelNote}
${topic ? '범위/지문: ' + topic : ''}
지침:
- 글씨가 엉망이거나 불분명해도 최대한 읽어주세요 (아이들 손글씨 기준).
- 각 빈칸(번호)별로 학생이 쓴 답을 그대로 옮기고, 정답 여부를 판단하세요.
- 철자가 맞고 의미가 정확하면 정답. 대소문자 무관.
- isCorrect가 false일 때: correctAnswer에 정답만 써주세요.
JSON 형식으로만 응답:
{
  "items": [
    {"number": 1, "studentAnswer": "학생 답 그대로", "isCorrect": true, "correctAnswer": ""},
    {"number": 2, "studentAnswer": "학생 답 그대로", "isCorrect": false, "correctAnswer": "정답"}
  ],
  "correctCount": 맞은수,
  "totalCount": 전체수,
  "totalScore": 0~100,
  "feedback": ${feedbackLine}
}`;
  } else {
    const topicNote = topic ? 'topic: "' + topic + '"' : '자유 작문';
    prompt = `당신은 한국 영어학원 선생님입니다. 학생이 손으로 쓴 영어 작문을 채점해주세요.
수준: ${levelNote}, ${topicNote}
지침: 글씨가 엉망이어도 최대한 읽으세요. 한국 중고등학생 수준에 맞게 평가하세요.
JSON 형식으로만 응답:
{
  "transcription": "영어 원문 (틀린 철자도 그대로)",
  "scores": {"grammar": 0~30, "content": 0~30, "expression": 0~25, "structure": 0~15},
  "totalScore": 0~100,
  "feedback": ${feedbackLine}
}`;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: [
        ...imgList,
        { type: 'text', text: prompt },
      ]}],
    });

    const text = response.content[0].text.trim();
    const jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 응답 파싱 실패');
    const result = JSON.parse(jsonMatch[0]);

    if (mode === 'vocabulary') {
      const total = result.totalCount || result.results?.length || 1;
      const correct = result.correctCount || result.results?.filter(r => r.isCorrect).length || 0;
      result.score = Math.round((correct / total) * 100);
      result.totalScore = result.score;
    } else if (mode === 'interpretation') {
      const items = result.items || [];
      const correct = items.filter(i => i.isCorrect).length;
      const total = items.length || 1;
      result.totalScore = result.totalScore ?? Math.round((correct / total) * 100);
    } else if (result.scores) {
      result.scores.grammar = Math.max(0, Math.min(30, result.scores.grammar || 0));
      result.scores.content = Math.max(0, Math.min(30, result.scores.content || 0));
      result.scores.expression = Math.max(0, Math.min(25, result.scores.expression || 0));
      result.scores.structure = Math.max(0, Math.min(15, result.scores.structure || 0));
      result.totalScore = Object.values(result.scores).reduce((a, b) => a + b, 0);
    }

    return res.status(200).json({ ...result, mode });

  } catch (error) {
    console.error('English grade error:', error);
    return res.status(500).json({ error: error.message });
  }
}

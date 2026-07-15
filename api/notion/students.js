// api/notion/students.js
// 학생 목록 — KS 회원 관리 DB 연동 (읽기 전용)
// 학생 추가/수정/삭제는 Notion KS 회원 관리에서 직접 진행
// 등록 구분 = 재원생/신규생인 학생만 자동 표시
import { Client } from '@notionhq/client';

// KS 회원 관리 DB ID (고정)
const KS_MEMBERS_DB = process.env.NOTION_STUDENTS_DB_ID || '1561d636-eade-8105-9ff1-000b3acd0735';

function getNotion() {
  if (!process.env.NOTION_TOKEN) throw new Error('NOTION_TOKEN 환경변수가 없습니다');
  return new Client({ auth: process.env.NOTION_TOKEN });
}

function pageToStudent(page) {
  const props = page.properties;
  // 선택: multi_select → [중등영어, 중등수학, ...]
  const subjects = (props['선택']?.multi_select || []).map(o => o.name);
  // 학년: formula → string
  const grade = props['학년']?.formula?.string || '';
  return {
    id: page.id,
    name: props['학생 이름']?.title?.[0]?.plain_text || '',
    grade,
    subjects,
    className: subjects[0] || '',
    memo: '',
    phone: props['학생 연락처']?.phone_number || '',
    createdAt: page.created_time,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: '학생 정보는 Notion KS 회원 관리에서 직접 수정해주세요.',
      hint: '등록 구분을 재원생으로 설정하면 채점앱에 자동 반영됩니다.',
    });
  }

  try {
    const notion = getNotion();

    const response = await notion.databases.query({
      database_id: KS_MEMBERS_DB,
      filter: {
        or: [
          { property: '등록 구분', status: { equals: '재원생' } },
          { property: '등록 구분', status: { equals: '신규생' } },
        ],
      },
      sorts: [{ property: '학생 이름', direction: 'ascending' }],
    });

    const students = response.results.map(pageToStudent);

    // 과목별 그룹 정보도 함께 반환
    const subjectGroups = ['중등영어', '고등영어', '중등수학', '고등수학'];
    const grouped = {};
    subjectGroups.forEach(s => { grouped[s] = []; });
    students.forEach(st => {
      st.subjects.forEach(subj => {
        if (grouped[subj]) grouped[subj].push(st);
      });
    });

    return res.status(200).json({ students, grouped });

  } catch (error) {
    console.error('Students API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

# 해빛 에이전트 — Hermes 폐쇄형 학습루트 구조

> Inspired by [NousResearch/hermes-agent](https://github.com/nousresearch/hermes-agent)

## 폴더 구조

```
해빛-agent/
├── SOUL.md              # 에이전트 페르소나 & 핵심 원칙
├── MEMORY.md            # 누적 메모리 (세션마다 자동 업데이트)
├── USER_PROFILE.md      # 사용자 모델링 (Honcho 방식)
├── README.md            # 이 파일
├── SKILLS/
│   ├── 입시_브리핑.skill.md        # 입시 이슈 자동 수집·전송
│   └── 자기개선_반성.skill.md      # 세션 후 자기평가
└── logs/
    └── (실행 기록)
```

## 폐쇄형 학습루트 (Closed Learning Loop)

```
요청 → 실행 → 평가 → MEMORY 업데이트 → SKILLS 개선 → 더 나은 다음 실행
```

Hermes 에이전트의 핵심 아이디어를 Cowork 환경에 이식:
- **스킬 자동생성**: 새 복잡한 작업 → SKILLS/ 에 절차 문서화
- **메모리 지속**: 세션 간 학습 유지
- **사용자 모델링**: USER_PROFILE.md에 선호/패턴 축적
- **스케줄 자동화**: 반복 작업은 Cowork 스케줄러에 위임

## 활성 자동화

| 작업 | 주기 | 출력 |
|------|------|------|
| 입시 일일 브리핑 | 매일 09:00 | 카카오톡 나에게 보내기 |

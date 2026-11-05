# Render + PostgreSQL 배포 안내 (Codex 연동)

## 준비물
- GitHub 저장소 (Codex에서 수정할 프로젝트)
- Render 계정
- Render PostgreSQL 데이터베이스 (유료 지속 운영 권장)

## 1. GitHub에 코드 올리기
이 압축파일을 풀고 **내용물**(`server.js`, `package.json`, `public/`, `render.yaml` 등)을 저장소 루트에 업로드하세요. `.env` 파일이나 비밀번호는 업로드하지 마세요.

## 2. PostgreSQL 만들기
Render 대시보드에서 **New > Postgres**로 DB를 생성하세요. DB는 웹 서비스와 **같은 리전**을 선택하세요. DB 화면의 **Internal Database URL**을 복사해 두세요. 이 URL은 비밀정보이므로 GitHub에 올리지 마세요.

> Render의 무료 PostgreSQL은 장기 보관 및 상시 운영에 적합하지 않을 수 있습니다. 무료 DB의 만료 및 용량 제한, 유료 DB 비용을 생성 화면에서 확인하세요.

## 3. 웹 서비스 배포
- Render에서 **New > Blueprint**를 선택하고 GitHub 저장소를 연결하면 `render.yaml`을 이용할 수 있습니다.
- 또는 **New > Web Service**로 직접 만들고, `Build Command = npm install`, `Start Command = npm start`, `Health Check Path = /health`로 설정하세요.
- 24시간 대기 없이 접속하는 것이 중요하다면 **Starter 이상 유료 웹 인스턴스**를 선택하세요. `render.yaml`은 Starter로 설정되어 있습니다.

## 4. 환경 변수
Render 웹 서비스의 **Environment**에서 다음을 설정하세요.

| 이름 | 값 |
|---|---|
| `DATABASE_URL` | PostgreSQL의 **Internal Database URL** |
| `ADMIN_PASSWORD` | 본인만 아는 길고 고유한 관리자 비밀번호 |
| `SESSION_SECRET` | 32자 이상 무작위 문자열 (Blueprint는 자동 생성) |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |

`PORT`는 Render가 자동 설정합니다. `DATABASE_SSL`은 Render 내부 DB 접속에서는 기본적으로 설정하지 마세요. 외부 DB를 쓸 때만 해당 공급자의 SSL 설정을 따르세요.

## 5. 배포 확인
- Render가 제공한 `https://서비스명.onrender.com` 접속
- `https://서비스명.onrender.com/health`에서 `{ "ok": true }` 확인
- 관리자 로그인 → 룰렛 추가 → 다른 브라우저에서 목록 확인
- 로그아웃 후 등록/수정/삭제가 차단되는지 확인

## 6. Codex와 자동 배포
Codex에서 이 저장소를 열고 수정한 뒤 GitHub의 배포 브랜치에 반영하면, Render의 자동 배포가 활성화된 경우 새 버전이 배포됩니다. 배포 전 코드 검사는 `npm run check`로 할 수 있습니다.

## 비용과 데이터 유의사항
- Render 웹 서비스와 PostgreSQL은 **각각 요금**이 발생할 수 있습니다. 실제 요금은 Render 대시보드에서 확인하세요.
- 이 앱은 시작할 때 DB 테이블을 자동 생성합니다. 기존 브라우저 localStorage 기록은 자동 이전되지 않습니다.
- 배너와 공통 이미지는 DB에 저장되므로 데이터베이스 백업을 권장합니다.
- Render 운영 계정과 GitHub 연결은 사용자가 직접 승인해야 합니다. 이 파일을 만든 것만으로 실제 배포되지는 않습니다.

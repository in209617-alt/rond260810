# 초록 숲 (2인 멀티플레이 프로토타입)

동물의 숲 같은 게임을 스타듀밸리 느낌의 2D 도트 그래픽으로 만드는 프로젝트의 첫 번째 테스트 버전이에요.
GitHub Pages에서 실행되고, 두 사람이 같은 숲에서 서로의 캐릭터를 보며 돌아다닐 수 있어요.
위치, 바라보는 방향, 걷기·달리기 애니메이션이 Firebase Realtime Database로 실시간 동기화돼요.

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 틀 (로비, HUD, 모바일 버튼) |
| `style.css` | 스타일 |
| `js/world.js` | 맵 생성, 충돌 판정, 바닥 그리기, 기본 그림 |
| `js/assets.js` | `assets/` 폴더의 그래픽 PNG 불러오기 |
| `assets/` | **게임 그래픽 파일** (교체 방법은 `ASSETS.md`) |
| `js/main.js` | 게임 루프, 입력, 화면 그리기, 상대 플레이어 보간 |
| `js/net.js` | Firebase 연결 (Google 로그인, 방 입장, 위치 전송·수신) |
| `js/firebase-config.js` | **내 Firebase 프로젝트 값을 넣는 곳** |
| `database.rules.json` | Realtime Database 보안 규칙 (초대한 이메일만 입장, 최대 2명, 자기 캐릭터만 수정) |

## 1. Firebase 준비 (처음 한 번)

1. [Firebase 콘솔](https://console.firebase.google.com)에서 **프로젝트 추가**.
2. 왼쪽 메뉴 **빌드 → Realtime Database → 데이터베이스 만들기**.
   - 위치는 한국과 가까운 **싱가포르(asia-southeast1)** 를 추천해요.
   - "잠금 모드"로 시작해도 돼요. 아래 3번에서 규칙을 바꿔요.
3. Realtime Database의 **규칙** 탭을 열고, `database.rules.json` 내용을 통째로 붙여 넣어요.
   - `MY_EMAIL@gmail.com` 과 `FRIEND_EMAIL@gmail.com` 이 **네 군데** 있어요 (`.read` 줄에 2개, `.write` 줄에 2개).
     `Ctrl+F` 로 찾아서 내 Gmail 주소와 친구 Gmail 주소로 바꾼 뒤 **게시**.
   - 이메일은 **소문자**로 정확히 적어요.
   - 실제 이메일은 **Firebase 콘솔에만** 적고, GitHub에 올리는 `database.rules.json` 파일은 그대로 두세요. 저장소가 공개라서 파일에 적으면 이메일이 보여요.
4. **빌드 → Authentication → 로그인 방법** 에서
   - **Google** 을 **사용 설정** (프로젝트 지원 이메일은 내 Gmail 선택) → 저장
   - 예전에 켜 둔 **익명** 은 **사용 중지**
5. **프로젝트 설정(톱니바퀴) → 일반 → 내 앱 → 웹 앱(`</>`) 추가**.
   - 나오는 `firebaseConfig` 값을 `js/firebase-config.js` 에 그대로 붙여 넣으세요.
   - `databaseURL` 이 비어 있으면 Realtime Database 화면 맨 위에 보이는 주소(`https://...firebasedatabase.app`)를 넣으면 돼요.
6. **Authentication → 설정 → 승인된 도메인** 에 `내아이디.github.io` 를 추가하세요.

> `firebase-config.js` 의 값은 웹에 공개돼도 괜찮은 식별 정보예요. 데이터 보호는 3번의 보안 규칙이 맡아요.

## 2. GitHub Pages에 올리기

1. GitHub에서 새 저장소를 만들어요 (예: `forest-game`, Public).
2. 이 폴더의 파일을 모두 올려요 (`index.html` 이 저장소 맨 위에 있어야 해요).
3. 저장소 **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** / **/(root)** → Save
4. 1~2분 뒤 `https://내아이디.github.io/forest-game/` 에서 열려요.

## 3. 같이 플레이하기

1. 이름과 방 이름을 입력하고 **숲으로 들어가기**.
2. 왼쪽 위 **초대 링크 복사** 를 눌러 친구에게 보내요. 링크에 방 이름이 들어 있어요.
3. 친구가 링크로 들어오면 두 캐릭터가 같은 숲에 보여요. 1P는 빨간 셔츠, 2P는 파란 셔츠예요.

- 조작: `W A S D` 또는 방향키로 동서남북 이동, `Shift` 로 달리기. 휴대폰은 화면 버튼.
- 규칙에 등록한 Google 계정만 들어올 수 있어요. 등록되지 않은 계정으로 들어오면 "초대 목록에 없어요" 안내가 떠요.
- 혼자 테스트할 때는 **같은 컴퓨터에서 탭 두 개**로 열어도 돼요. 같은 계정이어도 1P, 2P 자리에 하나씩 앉아요.
- 카카오톡에서 링크를 누르면 앱 안 브라우저가 열리는데, 여기서는 Google 로그인이 막혀 있어요. **Chrome이나 Safari로 열어** 주세요. 게임 화면에 바로 여는 버튼이 나와요.
- 한 방에 세 번째 사람이 들어오려고 하면 "이미 두 명이 있어요" 안내가 떠요.

## 로컬에서 실행하기

JavaScript 모듈을 쓰기 때문에 `index.html` 을 더블클릭하면 동작하지 않아요. 간단한 로컬 서버로 여세요.

```bash
# 이 폴더에서
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 열기
```

VS Code를 쓴다면 Live Server 확장으로 열어도 돼요.

`firebase-config.js` 의 `apiKey` 가 비어 있으면 **혼자 테스트 모드**로 실행돼요. 이때 브라우저 콘솔에서
`__forest.fakeRemote({ x: 470, y: 414, dir: "left", moving: true })` 를 입력하면 가짜 2P가 나타나서 화면을 확인할 수 있어요.

## 동기화 방식

- 데이터 위치: `rooms/{방이름}/players/0` (1P), `rooms/{방이름}/players/1` (2P) = `{ uid, name, slot, x, y, dir, moving, running, t }`
- 자리가 두 개뿐이라서 보안 규칙이 세 번째 사람을 자동으로 막아요.
- 보안 규칙이 로그인한 Google 계정의 이메일을 확인해서, 등록된 두 사람만 방을 읽고 쓸 수 있어요.
- 이동 중에는 약 초당 14번 위치를 보내고, 방향·걷기·달리기 상태가 바뀌면 즉시 보내요. 가만히 있을 때는 보내지 않아요.
- 상대 캐릭터는 받은 위치로 부드럽게 따라가고, 다음 데이터가 올 때까지 같은 방향으로 걷는다고 예측해서 끊김을 줄여요.
- 걷기 애니메이션은 상대가 보낸 `moving`·`running` 값으로 각자 화면에서 재생해요.
- 창을 닫거나 인터넷이 끊기면 서버가 자동으로 그 플레이어를 지워요 (`onDisconnect`).
- 접속 중인 플레이어는 5초마다 신호(`t`)를 보내요. 20초 넘게 신호가 없는 자리는 빈자리로 보고 다른 사람이 앉을 수 있어요.
  그래서 브라우저가 강제 종료돼 자리가 남아도 최대 20초 뒤에는 다시 들어갈 수 있어요.
- 로그인은 탭마다 따로 유지돼요. 한 탭에서 계정을 바꿔도 다른 탭의 플레이어는 영향을 받지 않아요.
- 게임 중 왼쪽 위 **접속 정보** 를 누르면 두 자리의 상태(누가 앉았는지, 마지막 신호가 몇 초 전인지)를 볼 수 있어요.

## 다음 단계 아이디어

- 표지판·친구에게 다가가서 `E` 로 말 걸기, 말풍선 채팅
- 사과 줍기, 꽃 심기처럼 맵이 바뀌는 상호작용 (DB에 `rooms/{방}/world` 추가)
- 각자의 섬 저장, 친구 섬에 놀러 가기

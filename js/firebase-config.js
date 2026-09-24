// Firebase 콘솔 → 프로젝트 설정 → 일반 → 내 앱(웹 앱)에 나오는 값을 그대로 붙여 넣으세요.
// 이 값들은 웹에 공개돼도 괜찮은 식별 정보예요. 실제 보안은 database.rules.json(보안 규칙)이 담당해요.
//
// apiKey가 비어 있으면 게임은 "혼자 테스트 모드"로 실행돼요.

export const firebaseConfig = {
  apiKey: "AIzaSyC6rrmiHIA-BCo_MN0y9pAPJm3IEBKZ2fw",
  authDomain: "roud260810.firebaseapp.com",
  databaseURL: "https://roud260810-default-rtdb.asia-southeast1.firebasedatabase.app",   // 예: https://내프로젝트-default-rtdb.asia-southeast1.firebasedatabase.app
  projectId: "roud260810",
  storageBucket: "roud260810.firebasestorage.app",
  messagingSenderId: "528324185459",
  appId: "1:528324185459:web:632619fd12af3c60868906"
};

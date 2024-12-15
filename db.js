const mysql = require("mysql2");
//createConnection vs creatPool
const db = mysql.createPool({
  host: "cooperation6team.c3uk8eymwvsn.ap-northeast-2.rds.amazonaws.com",
  user: "yoo",
  password: "kdkd8743",
  database: "cooperation6team",
});

// DB 연결 확인 (createPool에서는 connect 사용 불가)
db.getConnection((err, connection) => {
  if (err) {
    console.error("DB 연결 실패:", err);
    return;
  }
  console.log("DB 연결 성공");
  connection.release(); // 연결 반환 (풀로 되돌림)
});

module.exports = db;
// const mysql = require("mysql2");

// const db = mysql.createConnection({
//   host: "127.0.0.1", // 호스트 주소
//   user: "root", // 사용자 이름
//   password: "1234", // MySQL 사용자 비밀번호
//   database: "talent", // 데이터베이스 이름
// });

// db.connect((err) => {
//   if (err) {
//     console.log(err);
//   }
//   console.log("데이터베이스 연결 성공");
// });

// module.exports = db;

const express = require("express");
const app = express();
const port = 4000;
const db = require("./db");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const twilio = require("twilio");
app.listen(port, () => {
  console.log(`포트가 ${port}인 서버 실행`);
});

app.use(
  cors({
    origin: "http://127.0.0.1:5500", // 프론트엔드 도메인 명시
    credentials: true, // 쿠키를 포함한 요청 허용
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 폼 데이터를 파싱하기 위해 존재함.

// 로그인
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  // 이메일과 비밀번호 검증을 위한 SQL 쿼리
  const query = "SELECT * FROM users WHERE email = ? AND password = ?";

  db.query(query, [email, password], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        message: "서버 오류가 발생했습니다.",
      });
    }

    // 이메일과 비밀번호가 일치하는 사용자가 있는지 확인
    if (results.length === 0) {
      return res.status(401).json({
        message: "이메일 또는 비밀번호가 잘못되었습니다.",
      });
    }

    //req.cookies.email을 사용할 수 잇음
    console.log(results[0].email);
    console.log(results[0].master);

    res.cookie("email", results[0].email, {
      domain: "127.0.01",
      maxAge: 1000 * 60 * 60 * 24, // 1일
      sameSite: "None", // 크로스 사이트 제한
      secure: true, // HTTPS 환경에서만 전송
      httpOnly: false, // JavaScript에서 접근 허용
      path: "/", // 모든 경로에서 유효
    });

    res.cookie("master", results[0].master, {
      domain: "127.0.01", //나중에 삭제
      maxAge: 1000 * 60 * 60 * 24, // 1일
      sameSite: "None",
      secure: true,
      httpOnly: false,
      path: "/",
    });

    console.log("로그인");
    res.json({
      message: "로그인 성공!",
    });
  });
});

//로그아웃
app.get("/logout", (req, res) => {
  //새로고침해서 쿠키가 사라지는 이유는 요청을 클라이언트에 보냈기 때문임
  if (req.cookies.email) {
    res.clearCookie("email", {
      path: "/", // 경로 일치
      sameSite: "None", // 크로스 사이트 제한
      secure: false, // secure 속성 일치
      httpOnly: false, // JavaScript 접근 허용
    });
    res.clearCookie("master", {
      path: "/",
      sameSite: "None",
      secure: false,
      httpOnly: false,
    });
    console.log("로그아웃");
    res.json({ message: "로그아웃 완료!" });
  } else {
    res.json({ message: "애초에 쿠키가 없음" });
  }
});

//학생 추가
app.post("/student/new", (req, res) => {
  const { name, email, password, high, phone, classes } = req.body;
  const query =
    "INSERT INTO users(name, email, password,high,phone,classes) VALUES(?,?,?,?,?,?)";
  db.query(query, [name, email, password, high, phone, classes], (err) => {
    if (err) {
      console.log(err);
      res.json({ message: "email이 중복되거나 알 수 없는 오류가 발생." });
    } else res.json({ message: "유저 추가 완료." });
  });
});

//학생 삭제
app.post("/student/delete", (req, res) => {
  const query = "DELETE FROM users where email = ?";
  db.query(query, req.body.email, (err) => {
    if (err) {
      console.log(err);
      res.send("알 수 없는 오류가 발생.");
    } else res.send("유저 삭제 완료.");
  });
});

// 학생 리스트 페이지네이션
app.post("/student/list", (req, res) => {
  const { page } = req.body; // 요청으로부터 페이지 번호를 받음
  const limit = 10; // 한 페이지당 10명
  const offset = (page - 1) * limit; // 시작 위치 설정

  const query = "SELECT * FROM users LIMIT ? OFFSET ?";

  db.query(query, [limit, offset], (err, results) => {
    if (err) {
      console.error("DB 오류:", err);
      return res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }

    // 총 사용자 수를 가져와 페이지네이션 정보를 추가
    const countQuery = "SELECT COUNT(*) AS total FROM users";
    db.query(countQuery, (countErr, countResults) => {
      if (countErr) {
        console.error("카운트 오류:", countErr);
        return res.status(500).json({ message: "서버 오류가 발생했습니다." });
      }

      const total = countResults[0].total;
      const totalPages = Math.ceil(total / limit);

      res.json({
        currentPage: page,
        totalPages,
        totalUsers: total,
        students: results,
      });
    });
  });
});

// multer 설정: 업로드된 파일 저장 경로 및 파일명 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // 'uploads/' 폴더에 저장
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname); // 파일명을 현재 시간 + 원본 파일명으로 설정
  },
});

const upload = multer({ storage: storage });

// 게시글 작성
app.post("/boards", upload.single("image"), (req, res) => {
  // 쿠키에서 사용자 이메일 가져오기
  const email = req.body.email;

  // 요청 본문에서 제목과 내용을 추출
  const { title, content } = req.body;

  // 업로드된 파일 경로 확인
  const path = req.file ? req.file.path : null;

  // 데이터베이스에서 작성자 이름 추출
  const userQuery = `SELECT name FROM users WHERE email = ?`;

  db.query(userQuery, [email], (userErr, userResults) => {
    if (userErr) {
      console.error(userErr);
      return res
        .status(500)
        .json({ error: "Database error while fetching user data" });
    }

    if (userResults.length === 0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    const writer = userResults[0].name; // 작성자 이름

    // 게시글 삽입 쿼리
    const boardQuery = `
      INSERT INTO boards (writer, title, content, email, path) 
      VALUES (?, ?, ?, ?, ?)
    `;
    const values = [writer, title, content, email, path];

    db.query(boardQuery, values, (boardErr, boardResult) => {
      if (boardErr) {
        console.error(boardErr);
        return res
          .status(500)
          .json({ error: "Database error while inserting board" });
      }

      res.status(201).json({
        message: "게시글이 성공적으로 작성되었습니다.",
        id: boardResult.insertId, // 생성된 게시글 ID
      });
    });
  });
});

//게시글 목록(커서 기반 페이징)
app.get("/boards", (req, res) => {
  const { lastId } = req.query; // 클라이언트에서 전달받은 마지막 게시글 ID

  // 마지막 ID가 없으면 첫 번째 페이지부터 조회
  const sql = lastId
    ? `SELECT id, title, writer FROM boards WHERE id > ? ORDER BY id ASC LIMIT 10`
    : `SELECT id, title, writer FROM boards ORDER BY id ASC LIMIT 10`;

  const params = lastId ? [lastId] : [];

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }

    // 게시글 데이터와 마지막 게시글 ID 반환
    res.status(200).json({
      boards: results,
      nextCursor: results.length > 0 ? results[results.length - 1].id : null, // 다음 커서 설정
    });
  });
});

//게시글 하나 상세조회
app.get("/boards/:id", (req, res) => {
  const { id } = req.params; // URL에서 게시글 ID 추출

  // SQL 쿼리: 특정 게시글 ID에 해당하는 정보 조회
  const sql = `
    SELECT 
      b.id, 
      b.title, 
      b.content, 
      b.writer, 
      u.email, 
      u.name AS writer_name, 
      b.path 
    FROM boards b
    JOIN users u ON b.email = u.email
    WHERE b.id = ?
  `;

  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "해당 게시글을 찾을 수 없습니다." });
    }

    const post = results[0]; // 게시글 데이터

    if (post.path) {
      // 파일의 실제 경로
      const filePath = path.join(__dirname, post.path);

      // 파일을 읽어서 스트림으로 전송
      fs.readFile(filePath, (fileErr, fileData) => {
        if (fileErr) {
          console.error(fileErr);
          return res
            .status(500)
            .json({ error: "파일을 읽는 중 오류가 발생했습니다." });
        }

        // 파일과 게시글 정보를 함께 전송
        res.status(200).json({
          id: post.id,
          title: post.title,
          content: post.content,
          writer: post.writer,
          writer_name: post.writer_name,
          email: post.email,
          file: fileData.toString("base64"), // 파일을 Base64로 인코딩
        });
      });
    } else {
      // 파일이 없는 경우 게시글 데이터만 전송
      res.status(200).json({
        id: post.id,
        title: post.title,
        content: post.content,
        writer: post.writer,
        writer_name: post.writer_name,
        email: post.email,
        file: null, // 파일 없음
      });
    }
  });
});

// 게시글 삭제 (작성자 또는 마스터 권한 확인)
app.post("/boards/:postId", (req, res) => {
  const { postId } = req.params; // URL에서 postId 추출
  const userEmail = req.body.email; // 쿠키에서 사용자 이메일 추출
  const isMaster = req.body.master; // 쿠키에서 마스터 여부 추출

  if (!userEmail) {
    return res.status(401).json({ message: "로그인 정보가 없습니다." });
  }

  // 게시글 작성자와 마스터 여부 확인을 위한 SQL 쿼리
  const query = `
    SELECT email FROM boards WHERE id = ?
  `;

  db.query(query, [postId], (err, results) => {
    if (err) {
      console.error(err);
      return res
        .status(500)
        .json({ message: "데이터베이스 오류가 발생했습니다." });
    }

    // 게시글이 존재하지 않을 경우
    if (results.length === 0) {
      return res
        .status(404)
        .json({ message: "해당 게시글을 찾을 수 없습니다." });
    }

    const postOwnerEmail = results[0].email;

    // 작성자 또는 마스터가 아닌 경우
    if (userEmail !== postOwnerEmail && isMaster !== "1") {
      return res.status(403).json({ message: "권한이 없습니다." });
    }

    // 게시글 삭제 쿼리
    const deleteQuery = `
      DELETE FROM boards WHERE id = ?
    `;

    db.query(deleteQuery, [postId], (deleteErr, deleteResult) => {
      if (deleteErr) {
        console.error(deleteErr);
        return res
          .status(500)
          .json({ message: "게시글 삭제 중 오류가 발생했습니다." });
      }

      // 삭제된 행이 없는 경우 (이미 삭제되었거나 존재하지 않음)
      if (deleteResult.affectedRows === 0) {
        return res
          .status(404)
          .json({ message: "해당 게시글을 찾을 수 없습니다." });
      }

      res.status(200).json({ message: "게시글이 성공적으로 삭제되었습니다." });
    });
  });
});

//!!!!!!!!!!!!수납
//수납
app.post("/fee", (req, res) => {
  const { name, amount, student_grade, period } = req.body; // 클라이언트에서 보낸 데이터 추출

  if (!name || !amount || !student_grade || !period) {
    return res.status(400).json({ message: "모든 필드를 입력해주세요." });
  }

  const query =
    "INSERT INTO fees (name, amount, student_grade, period) VALUES (?, ?, ?, ?)";
  const values = [name, amount, student_grade, period];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error(err);
      return res
        .status(500)
        .json({ message: "데이터베이스 오류가 발생했습니다." });
    }

    res.status(201).json({ message: "수납 생성 성공", id: results.insertId });
  });
});

//수납 삭제
app.delete("/fee/:id", (req, res) => {
  const { id } = req.params; // URL에서 수납 ID 추출

  if (!id) {
    return res.status(400).json({ message: "수납 ID가 필요합니다." });
  }

  const query = "DELETE FROM fees WHERE id = ?";
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error(err);
      return res
        .status(500)
        .json({ message: "데이터베이스 오류가 발생했습니다." });
    }

    if (results.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "삭제할 수납 데이터를 찾을 수 없습니다." });
    }

    res.status(200).json({ message: "수납 삭제 성공" });
  });
});
app.post("/fee/page", (req, res) => {
  const { order, page } = req.body; // 클라이언트에서 전달한 데이터를 body에서 추출
  const limit = 10; // 한 페이지에 표시할 데이터 수
  const offset = (page - 1) * limit; // 페이지 계산 (0부터 시작)

  // 유효성 검사: order와 page가 숫자인지 확인
  if (isNaN(order) || isNaN(page) || page <= 0) {
    return res
      .status(400)
      .json({ message: "올바른 order 및 page 값을 입력해주세요." });
  }

  // order 값에 따른 student_grade 조건 설정
  let whereClause = "";
  if (order == 0) {
    // 중등 (01, 02, 03)
    whereClause = "WHERE student_grade IN ('01', '02', '03')";
  } else if (order == 1) {
    // 고등 (11, 12, 13)
    whereClause = "WHERE student_grade IN ('11', '12', '13')";
  } else if (order == 2) {
    // 전체 조회 (조건 없음)
    whereClause = "";
  } else {
    return res
      .status(400)
      .json({ message: "올바른 order 값을 입력해주세요 (0, 1, 2만 가능)." });
  }

  // SQL 쿼리 (페이지네이션용)
  const dataQuery = `
    SELECT id, name, amount, student_grade, period
    FROM fees
    ${whereClause}
    ORDER BY id ASC
    LIMIT ? OFFSET ?
  `;

  // SQL 쿼리 (총 금액 계산용)
  const totalAmountQuery = `
    SELECT SUM(amount) AS total_amount
    FROM fees
    ${whereClause}
  `;

  // 데이터베이스 조회 (총 금액 + 페이지네이션 데이터)
  db.query(totalAmountQuery, (err, totalResult) => {
    if (err) {
      console.error(err);
      return res
        .status(500)
        .json({ message: "총 금액 계산 중 데이터베이스 오류가 발생했습니다." });
    }

    const totalAmount = totalResult[0].total_amount || 0; // 총 금액이 없으면 0으로 처리

    db.query(dataQuery, [limit, offset], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          message: "페이지네이션 데이터 조회 중 오류가 발생했습니다.",
        });
      }

      res.status(200).json({
        message: "수납 목록 조회 성공",
        total_amount: totalAmount, // 총 금액
        data: results, // 페이지네이션된 데이터
      });
    });
  });
});

// 댓글 작성
app.post("/boards/:id/comments", (req, res) => {
  const boardId = req.params.id; // URL에서 게시글 ID 추출
  const email = req.body.email; // 쿠키에서 사용자 이메일 추출
  const content = req.body.content; // 댓글 내용
  if (!email) {
    return res.status(401).json({ message: "로그인이 필요합니다." });
  }

  if (!content) {
    return res.status(400).json({ message: "댓글 내용을 입력해주세요." });
  }

  // 사용자 이름 조회
  const userQuery = "SELECT name FROM users WHERE email = ?";
  db.query(userQuery, [email], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "서버 오류가 발생했습니다." });
    }
    if (results.length === 0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    const writer = results[0].name; // 작성자 이름

    const insertCommentQuery =
      "INSERT INTO comments (board_id, writer, content) VALUES (?, ?, ?)";
    db.query(insertCommentQuery, [boardId, writer, content], (err) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ message: "댓글 작성 중 오류가 발생했습니다." });
      }
      if (email == 1234) {
        const accountSid = ""; // Twilio 계정 SID
        const authToken = ""; // Twilio 인증 토큰
        const twilioPhoneNumber = ""; // Twilio 발신 번호
        const client = twilio(accountSid, authToken);
        const phoneNumber = ""; // 메세지 보낼 번호

        const result = client.messages.create({
          // await이 필요할까 굳이?
          to: phoneNumber, // 입력받은 전화번호 그대로 사용
          from: twilioPhoneNumber, // Twilio 발신 번호
          body: "질문에 선생님의 답변이 작성되었습니다.", // 메시지 내용
        });
      }
      res.status(201).json({ message: "댓글이 성공적으로 작성되었습니다." });
    });
  });
});

// 댓글 조회
app.get("/boards/:id/comments", (req, res) => {
  const boardId = req.params.id; // URL에서 게시글 ID 추출

  const selectCommentsQuery = `
    SELECT id, writer, content, created_at 
    FROM comments 
    WHERE board_id = ?
    ORDER BY created_at ASC
  `;

  db.query(selectCommentsQuery, [boardId], (err, results) => {
    if (err) {
      console.error(err);
      return res
        .status(500)
        .json({ message: "댓글 조회 중 오류가 발생했습니다." });
    }

    res.status(200).json({ comments: results });
  });
});

// 댓글 삭제
app.post("/comments/:id", (req, res) => {
  const commentId = req.params.id; // URL에서 댓글 ID 추출
  const userEmail = req.body.email; // 쿠키에서 사용자 이메일 추출
  const isMaster = req.body.master; // 마스터 여부 확인

  if (!userEmail) {
    return res.status(401).json({ message: "로그인이 필요합니다." });
  }

  // 댓글 작성자 확인
  const selectCommentQuery = "SELECT writer FROM comments WHERE id = ?";
  db.query(selectCommentQuery, [commentId], (err, results) => {
    if (err) {
      console.error(err);
      return res
        .status(500)
        .json({ message: "댓글 조회 중 오류가 발생했습니다." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "댓글을 찾을 수 없습니다." });
    }

    const writer = results[0].writer;

    // 작성자 또는 마스터인지 확인
    const userQuery = "SELECT name FROM users WHERE email = ?";
    db.query(userQuery, [userEmail], (err, userResults) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ message: "사용자 확인 중 오류가 발생했습니다." });
      }

      const currentUserName = userResults[0]?.name;
      if (currentUserName !== writer && isMaster !== "1") {
        return res.status(403).json({ message: "삭제 권한이 없습니다." });
      }

      // 댓글 삭제 쿼리
      const deleteCommentQuery = "DELETE FROM comments WHERE id = ?";
      db.query(deleteCommentQuery, [commentId], (err) => {
        if (err) {
          console.error(err);
          return res
            .status(500)
            .json({ message: "댓글 삭제 중 오류가 발생했습니다." });
        }

        res.status(200).json({ message: "댓글이 삭제되었습니다." });
      });
    });
  });
});

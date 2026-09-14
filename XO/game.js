(() => {
  "use strict";

  // ===== ข้อมูลและกติกาของเกม =====
  // กระดานเก็บค่า 9 ช่อง: H = ผู้เล่น, D = ผี, null = ช่องว่าง
  const HUMAN = "H";
  const DEVIL = "D";
  const EMPTY = null;
  const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  // ความยากของแต่ละคืน: เวลาต่อตา, จำนวนตาที่ต้องอยู่รอด และระดับเอฟเฟกต์
  const NIGHT_CONFIG = [
    null,
    { seconds: 10, survive: 6, madness: "calm" },
    { seconds: 10, survive: 7, madness: "calm" },
    { seconds: 5, survive: 8, madness: "disturbed" },
    { seconds: 5, survive: 9, madness: "disturbed" },
    { seconds: 3, survive: 10, madness: "panic" }
  ];
  // เนื้อเรื่องจะปลดล็อกเมื่อผ่านแต่ละคืน: ผู้เล่นค่อย ๆ รู้ว่าเกิดอะไรขึ้นในห้องนี้
  const STORY_FRAGMENTS = [
    null,
    { tag: "FRAGMENT 01 / 05", object: "นาฬิกาข้างเตียง", title: "เวลา 03:17", copy: "นาฬิกาที่ตายไปนานเริ่มเดินอีกครั้ง… แล้วหยุดที่ 03:17 ใต้หน้าปัดมีรอยขีดเป็นชื่อ “มาลี” ซ้ำแล้วซ้ำเล่า" },
    { tag: "FRAGMENT 02 / 05", object: "ภาพถ่ายบนผนัง", title: "คนที่หายไปจากรูป", copy: "ในภาพถ่ายเก่ามีหญิงสาวยืนข้างคุณ แต่ใบหน้าของเธอถูกขูดออกจนเหลือเพียงรอยเล็บยาว ๆ จากด้านในกรอบ" },
    { tag: "FRAGMENT 03 / 05", object: "ตู้เสื้อผ้า", title: "เธอไม่ได้จากไป", copy: "เสียงเคาะดังมาจากในตู้สามครั้ง คุณพบคำว่า “อย่าล็อกประตู” เขียนด้วยเลือดแห้งอยู่หลังบานไม้" },
    { tag: "FRAGMENT 04 / 05", object: "จดหมายที่ไม่เคยส่ง", title: "คำขอความช่วยเหลือ", copy: "กระดาษฉีกขาดเขียนว่า “ถ้าเขากลับมา อย่าปล่อยให้เขาเข้าห้อง” ลายมือท้ายจดหมายเหมือนลายมือของคุณ" },
    { tag: "FRAGMENT 05 / 05", object: "ความทรงจำที่ถูกฝัง", title: "คุณไม่ใช่ผู้รอดชีวิต", copy: "ผีไม่ได้รอคู่ต่อสู้… เธอรอคุณกลับมาที่ห้องเดิม เวลา 03:17 คือคืนที่คุณล็อกเธอไว้ และทิ้งเธอให้ตายเพียงลำพัง" }
  ];

  // รวมจุดอ้างอิงของ HTML ไว้ที่เดียว เพื่อให้ JavaScript อัปเดตหน้าจอได้ง่าย
  const ui = {
    board: document.querySelector("#board"), timer: document.querySelector("#turn-timer"),
    night: document.querySelector("#night-number"), count: document.querySelector("#survival-count"),
    notches: document.querySelector("#survival-notches"), message: document.querySelector("#turn-message"),
    rule: document.querySelector("#rule-message"), devil: document.querySelector("#devil-line"),
    home: document.querySelector("#home-button"), restart: document.querySelector("#restart-button"), help: document.querySelector("#help-button"),
    sound: document.querySelector("#sound-toggle"), modal: document.querySelector("#modal"),
    intro: document.querySelector("#intro-screen"), begin: document.querySelector("#begin-ritual"), introSound: document.querySelector("#intro-sound"), introVolume: document.querySelector("#intro-volume"), gameVolume: document.querySelector("#game-volume"),
    modalKicker: document.querySelector("#modal-kicker"), modalTitle: document.querySelector("#modal-title"),
    modalCopy: document.querySelector("#modal-copy"), modalButton: document.querySelector("#modal-button"),
    fragmentCard: document.querySelector("#fragment-card"), fragmentTag: document.querySelector("#fragment-tag"), fragmentObject: document.querySelector("#fragment-object")
  };

  // ===== สถานะที่เปลี่ยนไปขณะเล่น =====
  let board = Array(9).fill(EMPTY);
  let currentPlayer = HUMAN;
  let selected = null;
  let night = 1;
  let survivedTurns = 0;
  let timerId = null;
  let secondsLeft = 0;
  let locked = false;
  let gameOver = false;
  let audio = null;
  let solver = null;
  let placedAt = null;
  let winningCells = [];
  let victoryTimer = null;
  let volumeLevel = .55;

  // ===== ฟังก์ชันจัดการกติกา =====
  // เปลี่ยนกระดานและผู้เล่นให้เป็น key เดียว เพื่อใช้จดจำผลวิเคราะห์ของ Minimax
  const keyFor = (cells, player) => `${cells.map(v => v || "-").join("")}:${player}`;
  const count = (cells, player) => cells.reduce((n, piece) => n + (piece === player), 0);
  const winningLine = cells => WIN_LINES.find(([a,b,c]) => cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) || null;
  const winner = cells => {
    const line = winningLine(cells);
    return line ? cells[line[0]] : null;
  };
  // คืนกระดานชุดใหม่เสมอ จึงไม่แก้ข้อมูลเดิมระหว่างการจำลองตาเดินของ AI
  const applyMove = (cells, move, player) => {
    const next = [...cells];
    if (move.type === "place") next[move.to] = player;
    else { next[move.from] = EMPTY; next[move.to] = player; }
    return next;
  };
  // ก่อนมีหมาก 3 ตัว = วางหมาก; หลังจากนั้น = ย้ายหมากตัวเดิมไปยังช่องว่างใดก็ได้
  const legalMoves = (cells, player) => {
    const empty = cells.map((v,i) => v === EMPTY ? i : -1).filter(i => i >= 0);
    if (count(cells, player) < 3) return empty.map(to => ({ type: "place", to }));
    const own = cells.map((v,i) => v === player ? i : -1).filter(i => i >= 0);
    return own.flatMap(from => empty.map(to => ({ type: "move", from, to })));
  };

  // ===== Minimax แบบวิเคราะห์ทั้งเกม =====
  // สร้างกราฟของทุกกระดานที่เดินมาถึงได้เพียงครั้งเดียวตอนเปิดเกม
  // ค่า 1 = ผีบังคับชนะได้, 0 = วนเป็นเสมอ, -1 = ผู้เล่นบังคับชนะได้
  function buildSolver() {
    const states = new Map();
    const visit = (cells, player) => {
      const key = keyFor(cells, player);
      if (states.has(key)) return;
      const win = winner(cells);
      const state = { key, cells, player, win, moves: [], children: [], value: null };
      states.set(key, state);
      if (win) return;
      state.moves = legalMoves(cells, player);
      const nextPlayer = player === HUMAN ? DEVIL : HUMAN;
      for (const move of state.moves) {
        const next = applyMove(cells, move, player);
        const childKey = keyFor(next, nextPlayer);
        state.children.push(childKey);
        visit(next, nextPlayer);
      }
    };
    visit(Array(9).fill(EMPTY), HUMAN);

    // จุดจบของเกมเป็นคำตอบตั้งต้นสำหรับย้อนกลับไปประเมินตาก่อนหน้า
    for (const state of states.values()) {
      if (state.win === DEVIL) state.value = 1;
      if (state.win === HUMAN) state.value = -1;
    }

    // ย้อนผลจากลูกไปยังพ่อจนไม่มีสถานะใดเปลี่ยนค่าอีก
    let changed = true;
    while (changed) {
      changed = false;
      for (const state of states.values()) {
        if (state.value !== null || !state.children.length) continue;
        const children = state.children.map(key => states.get(key).value);
        if (state.player === DEVIL) {
          if (children.includes(1)) { state.value = 1; changed = true; }
          else if (children.every(v => v === -1)) { state.value = -1; changed = true; }
        } else {
          if (children.includes(-1)) { state.value = -1; changed = true; }
          else if (children.every(v => v === 1)) { state.value = 1; changed = true; }
        }
      }
    }
    // สถานะที่เหลือคือวงจรที่ไม่มีฝ่ายใดบังคับชนะ จึงนับเป็นเสมอ
    for (const state of states.values()) if (state.value === null) state.value = 0;
    return states;
  }

  function resultFor(cells, player) { return solver.get(keyFor(cells, player))?.value ?? 0; }
  // ผีเลือกเฉพาะตาที่ได้คะแนนสูงสุด จึงไม่มีตาเดินที่ทำให้ผู้เล่นชนะได้
  function chooseDevilMove(cells) {
    const moves = legalMoves(cells, DEVIL);
    const rated = moves.map(move => ({ move, score: resultFor(applyMove(cells, move, DEVIL), HUMAN) }));
    const best = Math.max(...rated.map(item => item.score));
    return rated.filter(item => item.score === best)[Math.floor(Math.random() * rated.filter(item => item.score === best).length)].move;
  }
  // เมื่อเวลาหมดในคืน 1–4 ผีเลือกตาแทนผู้เล่น โดยเลือกตาที่เสียเปรียบที่สุด
  function chooseCruelHumanMove(cells) {
    const moves = legalMoves(cells, HUMAN);
    const safe = moves.filter(move => winner(applyMove(cells, move, HUMAN)) !== HUMAN);
    const candidates = safe.length ? safe : moves;
    const rated = candidates.map(move => ({ move, score: resultFor(applyMove(cells, move, HUMAN), DEVIL) }));
    const best = Math.max(...rated.map(item => item.score));
    return rated.find(item => item.score === best).move;
  }

  // ===== การวาดหน้าจอ =====
  // สร้างกระดาน 3×3 ใหม่ตาม state ปัจจุบัน พร้อมสถานะเลือก/วาง/ชนะ
  function render() {
    ui.board.innerHTML = "";
    board.forEach((piece, index) => {
      const cell = document.createElement("button");
      cell.className = `cell${selected === index ? " selected" : ""}${placedAt === index ? " arriving" : ""}${winningCells.includes(index) ? " winning" : ""}`;
      cell.type = "button";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", piece === HUMAN ? "เหรียญของคุณ" : piece === DEVIL ? "หมากของปีศาจ" : "ช่องว่าง");
      cell.disabled = locked || currentPlayer !== HUMAN || gameOver;
      if (piece) {
        const pieceEl = document.createElement("span");
        pieceEl.className = `piece ${piece === HUMAN ? "coin" : "bone"}`;
        pieceEl.setAttribute("aria-hidden", "true");
        cell.append(pieceEl);
      }
      cell.addEventListener("click", () => handleCell(index));
      ui.board.append(cell);
    });
    ui.night.textContent = night;
    ui.count.textContent = `${survivedTurns} / ${NIGHT_CONFIG[night].survive}`;
    ui.notches.innerHTML = Array.from({ length: NIGHT_CONFIG[night].survive }, (_, index) => `<i class="notch ${index < survivedTurns ? "lit" : ""}"></i>`).join("");
  }

  // คลิกครั้งแรกเลือกเหรียญ, คลิกช่องว่างครั้งถัดไปเพื่อย้ายเมื่อมีครบ 3 เหรียญ
  function handleCell(index) {
    if (locked || currentPlayer !== HUMAN || gameOver) return;
    const humanCount = count(board, HUMAN);
    if (humanCount < 3) {
      if (board[index] === EMPTY) commitHumanMove({ type: "place", to: index });
      return;
    }
    if (selected === null && board[index] === HUMAN) { selected = index; say("เลือกเหรียญแล้ว — ย้ายไปยังช่องว่าง", "ทุกช่องว่างคือคำเชิญของเขา"); render(); return; }
    if (selected !== null && board[index] === HUMAN) { selected = index; render(); return; }
    if (selected !== null && board[index] === EMPTY) commitHumanMove({ type: "move", from: selected, to: index });
  }

  // จบตาผู้เล่น: ตรวจเส้นของผู้เล่นก่อน แล้วจึงหน่วงให้ผีคิดและเดินตอบ
  function commitHumanMove(move) {
    selected = null;
    board = applyMove(board, move, HUMAN);
    animatePlacement(move.to);
    pulseTick(0.05);
    if (winner(board) === HUMAN) { endGame(false, "กระดานไม่ยอมรับชัยชนะของคุณ", "เจ้าคิดว่าเส้นสามเส้นนั้นช่วยได้หรือ? มันเพียงเปิดประตูให้ข้า"); return; }
    currentPlayer = DEVIL;
    stopTimer();
    locked = true;
    say("ผีกำลังมองผ่านดวงตาคุณ…", "ข้ารู้ก่อนที่เจ้าจะขยับ");
    render();
    window.setTimeout(devilTurn, night >= 5 ? 680 : 440);
  }

  // ตาผีใช้ผลจาก Minimax เลือกหมาก จากนั้นเพิ่มความคืบหน้าการอยู่รอด
  function devilTurn() {
    if (gameOver) return;
    const move = chooseDevilMove(board);
    board = applyMove(board, move, DEVIL);
    animatePlacement(move.to);
    pulseTick(0.08);
    if (winner(board) === DEVIL) { playDevilVictory(move.to); return; }
    survivedTurns += 1;
    if (survivedTurns >= NIGHT_CONFIG[night].survive) { surviveNight(); return; }
    currentPlayer = HUMAN;
    locked = false;
    say("หายใจเข้า… แล้วเลือก", night >= 3 ? "แสงกำลังผิดปกติ" : "เขายังยิ้มอยู่");
    render();
    startTimer();
  }

  // ครบจำนวนตาที่กำหนด = ผ่านคืนนั้น ไม่ต้องเอาชนะผี
  function surviveNight() {
    stopTimer(); locked = true;
    const fragment = STORY_FRAGMENTS[night];
    if (night === 5) {
      gameOver = true;
      showModal("THE LAST FRAGMENT", fragment.title, fragment.copy, "เริ่มพิธีใหม่", startGame, fragment);
      return;
    }
    showModal("FRAGMENT UNLOCKED", fragment.title, fragment.copy, "เก็บเบาะแส แล้วเผชิญคืนถัดไป", () => { night++; resetBoardForNight(); }, fragment);
  }

  function resetBoardForNight() {
    board = Array(9).fill(EMPTY); currentPlayer = HUMAN; survivedTurns = 0; selected = null; locked = false;
    document.body.className = NIGHT_CONFIG[night].madness;
    say("พิธีเริ่มอีกครั้ง", night >= 5 ? "สามวินาที — เท่านั้น" : "วางเหรียญลงบนกระดาน");
    render(); startTimer();
  }

  // ===== ตัวจับเวลาและความกดดัน =====
  // นับถอยหลังเฉพาะตาของผู้เล่น; เหลือ 3 วินาทีจะเปิด CSS class low-time
  function startTimer() {
    stopTimer();
    secondsLeft = NIGHT_CONFIG[night].seconds;
    ui.timer.textContent = secondsLeft;
    timerId = window.setInterval(() => {
      secondsLeft--;
      ui.timer.textContent = Math.max(0, secondsLeft);
      pulseTick(secondsLeft <= 3 ? 0.12 : 0.03);
      document.body.classList.toggle("low-time", secondsLeft <= 3);
      if (secondsLeft <= 0) { stopTimer(); timeExpired(); }
    }, 1000);
  }
  function stopTimer() { window.clearInterval(timerId); timerId = null; document.body.classList.remove("low-time"); }
  // คืน 5 แพ้ทันทีเมื่อหมดเวลา; คืนก่อนหน้า ผีจะบังคับให้เดินตาที่เสียเปรียบ
  function timeExpired() {
    if (gameOver || currentPlayer !== HUMAN) return;
    if (night === 5) { endGame(false, "เวลาหมดลง", "ในคืนที่ห้า… ปีศาจเลือกแทนคุณ"); return; }
    locked = true;
    const move = chooseCruelHumanMove(board);
    board = applyMove(board, move, HUMAN);
    animatePlacement(move.to);
    say("มือของคุณขยับเอง", "เขาเลือกหมากแทนคุณแล้ว");
    render();
    window.setTimeout(() => { if (winner(board) === HUMAN) endGame(false, "ผีบิดชัยชนะของคุณ", "ไม่มีทางชนะ มีเพียงการอยู่รอด"); else { currentPlayer = DEVIL; devilTurn(); } }, 650);
  }

  function say(message, devil) { ui.message.textContent = message; ui.devil.textContent = devil; }
  // ส่ง index ของหมากที่เพิ่งวางให้ CSS เล่นเอฟเฟกต์ตกกระทบ
  function animatePlacement(index) {
    placedAt = index;
    window.setTimeout(() => { if (placedAt === index) placedAt = null; }, 560);
  }
  // สร้างตัวเล่น Lottie ทับบนช่องชนะ แล้วกำหนดพิกัดจากตำแหน่งจริงของช่องนั้น
  function showDevilHand(index) {
    const target = ui.board.children[index];
    if (!target) return;
    const hand = document.createElement("div");
    hand.className = "devil-win-hand";
    hand.setAttribute("aria-hidden", "true");
    hand.style.setProperty("--hand-x", `${target.offsetLeft + target.offsetWidth / 2}px`);
    hand.style.setProperty("--hand-y", `${target.offsetTop + target.offsetHeight / 2}px`);
    const animation = document.createElement("dotlottie-wc");
    animation.src = "assets/animations/skeletal-hand-taps.lottie";
    animation.setAttribute("autoplay", "");
    animation.setAttribute("speed", "1.2");
    hand.append(animation);
    ui.board.append(hand);
    // บังคับให้เบราว์เซอร์วาดเฟรมแรกก่อนเติม class เพื่อให้ CSS animation เริ่มทุกครั้ง
    void hand.offsetWidth;
    hand.classList.add("placing");
  }
  // หน่วง Game Over เพื่อให้ผู้เล่นเห็นมือผีและเส้นสามช่องที่ทำให้แพ้ก่อน
  function playDevilVictory(index) {
    stopTimer();
    locked = true;
    winningCells = winningLine(board) || [];
    say("มือของมันเลือกช่องสุดท้ายแล้ว…", "จงมองเส้นที่เจ้าปล่อยให้ข้าสร้าง");
    render();
    showDevilHand(index);
    document.body.classList.add("devil-victory");
    victoryTimer = window.setTimeout(() => {
      victoryTimer = null;
      document.body.classList.remove("devil-victory");
      endGame(false, "ผีชนะแล้ว", "ตาของเจ้าจบลงตั้งแต่ก่อนเริ่ม");
    }, 2800);
  }
  function clearVictorySequence() {
    window.clearTimeout(victoryTimer);
    victoryTimer = null;
    winningCells = [];
    document.body.classList.remove("devil-victory");
  }
  function endGame(survived, title, copy) {
    gameOver = true; locked = true; stopTimer();
    showModal(survived ? "DAWN" : "GAME OVER", title, copy, "เริ่มพิธีใหม่", startGame);
    render();
  }
  // modal เดียวใช้หลายสถานการณ์; ส่ง fragment มาเฉพาะตอนปลดล็อกเนื้อเรื่อง
  function showModal(kicker, title, copy, buttonText, action, fragment = null) {
    ui.modalKicker.textContent = kicker; ui.modalTitle.textContent = title; ui.modalCopy.innerHTML = copy.replace(
  /(\d{2}:\d{2})/g,
  '<span class="inline-time">$1</span>'
); ui.modalButton.textContent = buttonText;
    // หัวข้อที่เป็นตัวเลข (เช่น 03:17) ใช้ฟอนต์อ่านง่ายกว่าหัวข้อเนื้อเรื่องทั่วไป
    ui.modalTitle.classList.toggle("numeric-title", /\d/.test(title));
    ui.fragmentCard.classList.toggle("hidden", !fragment);
    ui.modal.classList.toggle("story-modal", Boolean(fragment));
    if (fragment) { ui.fragmentTag.textContent = fragment.tag; ui.fragmentObject.textContent = fragment.object; }
    ui.modal.classList.remove("hidden"); ui.modalButton.onclick = () => { ui.modal.classList.remove("story-modal"); ui.modal.classList.add("hidden"); action?.(); };
  }
  function startGame() {
    clearVictorySequence();
    gameOver = false; night = 1; survivedTurns = 0; board = Array(9).fill(EMPTY); currentPlayer = HUMAN; selected = null; placedAt = null; locked = false;
    document.body.className = "calm";
    say("วางเหรียญลงบนกระดาน", "ข้ารู้ว่าคิดอะไรอยู่"); render(); startTimer();
  }

  function beginRitual() {
    // การกดปุ่มเป็น user gesture จึงทำให้เบราว์เซอร์อนุญาตให้เริ่มเสียงได้
    if (!audio || !audio.enabled) enableAudio();
    ui.begin.disabled = true;
    ui.intro.classList.add("leave");
    window.setTimeout(() => {
      ui.intro.classList.add("hidden");
      startGame();
    }, 650);
  }

  function returnToMain() {
    clearVictorySequence();
    stopTimer();
    locked = true;
    gameOver = false;
    selected = null;
    ui.modal.classList.remove("story-modal"); ui.modal.classList.add("hidden");
    ui.begin.disabled = false;
    ui.intro.classList.remove("hidden", "leave");
    document.body.className = "calm intro-active";
    say("เขารออยู่ที่โต๊ะ", "กลับมาแล้วหรือ?");
    render();
  }

  // ===== เสียงบรรยากาศด้วย Web Audio API =====
  function enableAudio() {
    if (audio) {
      audio.enabled = !audio.enabled;
      if (audio.enabled) {
        audio.ctx.resume();
        audio.music.play().catch(() => {});
      } else {
        audio.music.pause();
      }
      updateSoundControls();
      applyVolume();
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = .0001;
    gain.connect(ctx.destination);

    // เสียงต่ำ 2 ความถี่ที่จูนไม่ตรงกัน สร้างความรู้สึกไม่มั่นคง
    const droneGain = ctx.createGain();
    droneGain.gain.value = .28;
    droneGain.connect(gain);
    [43, 46.3].forEach((frequency, index) => {
      const drone = ctx.createOscillator();
      drone.type = index ? "triangle" : "sine";
      drone.frequency.value = frequency;
      drone.detune.value = index ? -9 : 4;
      drone.connect(droneGain);
      drone.start();
    });

    // noise ผ่าน filter ทำหน้าที่เหมือนลมและคลื่นวิทยุเสีย
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const radioFilter = ctx.createBiquadFilter();
    radioFilter.type = "bandpass";
    radioFilter.frequency.value = 540;
    radioFilter.Q.value = .75;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = .018;
    const breath = ctx.createOscillator();
    breath.type = "sine";
    breath.frequency.value = .075;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = .016;
    breath.connect(breathDepth).connect(noiseGain.gain);
    noise.connect(radioFilter).connect(noiseGain).connect(gain);
    noise.start();
    breath.start();

    // เสียงโลหะไกล ๆ สั่นช้าอยู่ใต้ชั้น noise
    const lament = ctx.createOscillator();
    lament.type = "sine";
    lament.frequency.value = 174;
    const lamentGain = ctx.createGain();
    lamentGain.gain.value = .012;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = .11;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 14;
    wobble.connect(wobbleDepth).connect(lament.frequency);
    lament.connect(lamentGain).connect(gain);
    lament.start();
    wobble.start();

    const music = new Audio("assets/audio/piano-track-10.wav");
    music.loop = true;
    music.preload = "auto";
    music.volume = .24;

    audio = { ctx, gain, music, enabled: true };
    ctx.resume();
    music.play().catch(() => {});
    applyVolume();
    updateSoundControls();
  }
  function applyVolume() {
    if (!audio) return;
    audio.gain.gain.setTargetAtTime(audio.enabled ? .13 * volumeLevel : .0001, audio.ctx.currentTime, .08);
    audio.music.volume = .24 * volumeLevel;
  }
  function setVolume(event) {
    volumeLevel = Number(event.target.value) / 100;
    ui.introVolume.value = event.target.value;
    ui.gameVolume.value = event.target.value;
    applyVolume();
  }
  function updateSoundControls() {
    const enabled = Boolean(audio?.enabled);
    ui.sound.setAttribute("aria-pressed", String(enabled));
    ui.sound.innerHTML = `<span class="sound-mark">${enabled ? "◉" : "◌"}</span> ${enabled ? "ปิดเสียงแห่งความมืด" : "ปลุกเสียงแห่งความมืด"}`;
    ui.introSound.setAttribute("aria-pressed", String(enabled));
    ui.introSound.innerHTML = `<span>${enabled ? "◉" : "◌"}</span> ${enabled ? "ปิดเสียง" : "เปิดเสียง"}`;
  }
  function pulseTick(volume) {
    if (!audio?.enabled) return;
    const { ctx, gain } = audio; const osc = ctx.createOscillator(); const tickGain = ctx.createGain();
    osc.type = "sine"; osc.frequency.setValueAtTime(780, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(130, ctx.currentTime + .055);
    tickGain.gain.setValueAtTime(volume, ctx.currentTime); tickGain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .06);
    osc.connect(tickGain).connect(gain); osc.start(); osc.stop(ctx.currentTime + .065);
  }

  ui.restart.addEventListener("click", () => showModal("BEGIN AGAIN", "เริ่มพิธีใหม่?", "ความทรงจำของปีศาจจะไม่หายไป แต่กระดานจะว่างเปล่า", "เริ่มใหม่", startGame));
  ui.home.addEventListener("click", returnToMain);
  ui.help.addEventListener("click", () => showModal("THE RULES", "กติกาแห่งคืน", "คุณและผีมีหมากฝ่ายละสามตัว วางให้ครบก่อน แล้วจึงย้ายหมากหนึ่งตัวไปยังช่องว่างในทุกตา เป้าหมายไม่ใช่ชนะ—จงอยู่รอดให้ครบจำนวนตาของคืนนั้น", "กลับสู่กระดาน", () => {}));
  ui.sound.addEventListener("click", enableAudio);
  ui.introSound.addEventListener("click", enableAudio);
  ui.introVolume.addEventListener("input", setVolume);
  ui.gameVolume.addEventListener("input", setVolume);
  ui.begin.addEventListener("click", beginRitual);

  // วิเคราะห์ทุกสถานะก่อนเริ่มเล่น จึงเป็น AI เชิงทฤษฎีเกม ไม่ใช่การสุ่มหรือเดา
  solver = buildSolver();
  document.body.className = "calm intro-active";
  render();
  say("เขารออยู่ที่โต๊ะ", "มีที่ว่างสำหรับเจ้าเสมอ");
})();

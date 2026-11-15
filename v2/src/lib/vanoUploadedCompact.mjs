/**
 * VANO Maps — Modelo 3D Low-Poly Interativo: VANO Compacto (Hatchback Urbano)
 *
 * Arquitetura de malha 100% estanque (watertight manifold grid):
 *   +X = Direita (simétrico em X=0)
 *   +Y = Cima (pneus apoiados em Y=0)
 *   -Z = Frente do veículo | +Z = Traseira do veículo
 */

export const VANO_COMPACTO_PALETTE = {
  body:        '#FF6B1A', // Laranja VANO principal
  bodyAccent:  '#EB5A0F', // Laranja de chanfro interno / vincos
  doorSeam:    '#C84707', // Linha sutil de divisão de porta
  glass:       '#1D2A3B', // Azul-marinho escuro panorâmico (referência VANO)
  glassRoof:   '#213044', // Teto panorâmico contínuo
  pillarDark:  '#151F2C', // Coluna B central entre vidros laterais
  tailUpper:   '#E5221C', // Lanterna traseira faceta superior (vermelho vivo)
  tailLower:   '#B21410', // Lanterna traseira faceta inferior (rubi profundo)
  headDrls:    '#F4F9FF', // DRL superior farol dianteiro
  headMain:    '#CFE2F5', // Lente principal farol dianteiro
  bumperTrim:  '#22252A', // Difusor traseiro / grade dianteira trapezoidal preta fosca
  underbody:   '#15171B', // Caixa de roda interna e assoalho escuro
  tire:        '#24262B', // Banda de rodagem e ombro do pneu
  tireSide:    '#2C2F36', // Lateral chanfrada do pneu
  rimLip:      '#1E2025', // Borda interna do aro
  hubcap:      '#383C44', // Calota central plana cinza-chumbo (idêntica à referência)
};

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function createVanoCompacto(options = {}) {
  const paletteHex = { ...VANO_COMPACTO_PALETTE, ...(options.palette || {}) };
  if (options.bodyColor && /^#[0-9a-f]{6}$/i.test(options.bodyColor)) {
    paletteHex.body = options.bodyColor;
  }

  const pal = Object.fromEntries(
    Object.entries(paletteHex).map(([k, v]) => [k, hexToRgb(v)])
  );

  const groups = {
    body:       { name: 'Body',       partId: 0, positions: [], normals: [], colors: [], matKey: 'body' },
    glass:      { name: 'Glass',      partId: 1, positions: [], normals: [], colors: [], matKey: 'glass' },
    trim:       { name: 'Trim',       partId: 2, positions: [], normals: [], colors: [], matKey: 'bumperTrim' },
    tailLights: { name: 'TailLights', partId: 3, positions: [], normals: [], colors: [], matKey: 'tailUpper' },
    headLights: { name: 'HeadLights', partId: 4, positions: [], normals: [], colors: [], matKey: 'headDrls' },
    wheelFL:    { name: 'Wheel_FL',   partId: 5, positions: [], normals: [], colors: [], matKey: 'tire', pivot: [-0.80, 0.37, -1.04] },
    wheelFR:    { name: 'Wheel_FR',   partId: 6, positions: [], normals: [], colors: [], matKey: 'tire', pivot: [ 0.80, 0.37, -1.04] },
    wheelRL:    { name: 'Wheel_RL',   partId: 7, positions: [], normals: [], colors: [], matKey: 'tire', pivot: [-0.80, 0.37,  1.10] },
    wheelRR:    { name: 'Wheel_RR',   partId: 8, positions: [], normals: [], colors: [], matKey: 'tire', pivot: [ 0.80, 0.37,  1.10] },
  };

  function addTri(groupName, a, b, c, rgb) {
    const g = groups[groupName];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) return;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c]) {
      g.positions.push(p[0], p[1], p[2]);
      g.normals.push(nx, ny, nz);
      g.colors.push(rgb[0], rgb[1], rgb[2]);
    }
  }

  function addPoly(groupName, pts, rgb, outwardHint = null) {
    if (pts.length < 3) return;
    let ordered = pts;
    if (outwardHint) {
      const a = pts[0], b = pts[1], c = pts[2];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const dot = nx * outwardHint[0] + ny * outwardHint[1] + nz * outwardHint[2];
      if (dot < 0) ordered = [...pts].reverse();
    }
    for (let i = 1; i < ordered.length - 1; i++) {
      addTri(groupName, ordered[0], ordered[i], ordered[i + 1], rgb);
    }
  }

  function addQuad(groupName, p0, p1, p2, p3, rgb, outwardHint = null) {
    addPoly(groupName, [p0, p1, p2, p3], rgb, outwardHint);
  }

  // ============================================================================
  // 1. LATERAL DA CARROCERIA + ARCOS DE RODA (Proporções reais de Hatch Compacto)
  // ============================================================================
  // Roda dianteira centrada em Z = -1.04 | Roda traseira centrada em Z = +1.10
  // Capô curto e arredondado na frente; cabine longa e teto alto até sobre a roda traseira!
  const sideStations = [
    // idx: z,     yBot, xBot, yFlare, xFlare, yBelt, xBelt, yDeck, xDeck, isArch
    /* 0 */ [-1.52, 0.25, 0.70, 0.49,   0.76,   0.74,  0.73,  0.78,  0.63,  0], // Quina do farol dianteiro
    /* 1 */ [-1.42, 0.23, 0.79, 0.54,   0.85,   0.80,  0.81,  0.84,  0.70,  1], // Início arco dianteiro
    /* 2 */ [-1.33, 0.53, 0.84, 0.67,   0.88,   0.85,  0.84,  0.89,  0.73,  1], // Subida frontal arco dianteiro
    /* 3 */ [-1.16, 0.72, 0.86, 0.81,   0.90,   0.90,  0.86,  0.94,  0.75,  1], // Topo frontal arco dianteiro
    /* 4 */ [-0.92, 0.72, 0.86, 0.81,   0.90,   0.93,  0.87,  0.97,  0.76,  1], // Topo traseiro arco dianteiro (Base para-brisa!)
    /* 5 */ [-0.75, 0.53, 0.85, 0.66,   0.89,   0.95,  0.88,  0.99,  0.76,  1], // Descida traseira arco dianteiro (Início vidro lateral!)
    /* 6 */ [-0.65, 0.21, 0.83, 0.46,   0.88,   0.96,  0.88,  1.00,  0.76,  1], // Fim arco dianteiro
    /* 7 */ [-0.30, 0.21, 0.83, 0.46,   0.89,   0.98,  0.88,  1.02,  0.76,  0], // Topo coluna A
    /* 8 */ [ 0.14, 0.21, 0.83, 0.47,   0.89,   1.00,  0.88,  1.04,  0.76,  0], // Coluna B (centro portas)
    /* 9 */ [ 0.60, 0.21, 0.83, 0.49,   0.89,   1.02,  0.88,  1.06,  0.75,  0], // Meio da porta traseira
    /*10 */ [ 0.72, 0.22, 0.84, 0.52,   0.89,   1.04,  0.88,  1.08,  0.74,  1], // Início arco traseiro
    /*11 */ [ 0.83, 0.53, 0.87, 0.68,   0.91,   1.05,  0.88,  1.09,  0.73,  1], // Subida frontal arco traseiro (Topo da coluna C!)
    /*12 */ [ 0.99, 0.72, 0.88, 0.82,   0.92,   1.07,  0.87,  1.11,  0.71,  1], // Topo frontal arco traseiro (Canto traseiro vidro lateral!)
    /*13 */ [ 1.23, 0.72, 0.88, 0.82,   0.92,   1.05,  0.86,  1.09,  0.67,  1], // Topo traseiro arco traseiro
    /*14 */ [ 1.40, 0.53, 0.86, 0.68,   0.90,   1.01,  0.83,  1.05,  0.63,  1], // Descida traseira arco traseiro
    /*15 */ [ 1.50, 0.23, 0.81, 0.54,   0.85,   0.98,  0.80,  1.02,  0.58,  1], // Fim arco traseiro (Base vigia traseiro!)
    /*16 */ [ 1.64, 0.25, 0.73, 0.52,   0.77,   0.94,  0.73,  0.97,  0.54,  0], // Quina externa da lanterna traseira
  ];

  for (const s of [-1, 1]) {
    for (let i = 0; i < sideStations.length - 1; i++) {
      const A = sideStations[i];
      const B = sideStations[i + 1];
      const zA = A[0], zB = B[0];

      const a0 = [s * A[2], A[1], zA];
      const a1 = [s * A[4], A[3], zA];
      const a2 = [s * A[6], A[5], zA];
      const a3 = [s * A[8], A[7], zA];

      const b0 = [s * B[2], B[1], zB];
      const b1 = [s * B[4], B[3], zB];
      const b2 = [s * B[6], B[5], zB];
      const b3 = [s * B[8], B[7], zB];

      // Saia inferior / moldura do arco de roda
      addQuad('body', a0, b0, b1, a1, pal.body, [s, -0.12, 0]);
      // Painel principal da porta / para-lama
      addQuad('body', a1, b1, b2, a2, pal.body, [s, 0.12, 0]);
      // Chanfro superior do ombro (peitoril)
      addQuad('body', a2, b2, b3, a3, pal.body, [s * 0.45, 0.88, 0]);

      // Fechamento inferior / caixa de roda interna até X = 0.48
      const xIn = 0.48;
      const aIn = [s * xIn, A[1], zA];
      const bIn = [s * xIn, B[1], zB];
      addQuad('trim', a0, b0, bIn, aIn, pal.underbody, [0, -1, 0]);
    }

    // Paredes internas das caixas de roda dianteira (1..6) e traseira (10..15)
    const fWell = sideStations.slice(1, 7).map(st => [s * 0.48, st[1], st[0]]);
    addPoly('trim', fWell, pal.underbody, [s, 0, 0]);

    const rWell = sideStations.slice(10, 16).map(st => [s * 0.48, st[1], st[0]]);
    addPoly('trim', rWell, pal.underbody, [s, 0, 0]);
  }

  // Assoalho central escuro
  addQuad(
    'trim',
    [-0.48, 0.22, -1.58],
    [ 0.48, 0.22, -1.58],
    [ 0.48, 0.23,  1.70],
    [-0.48, 0.23,  1.70],
    pal.underbody,
    [0, -1, 0]
  );

  // ============================================================================
  // 2. CAPÔ CURTO ARREDONDADO E FASCIA FRONTAL (Z = -0.92 até -1.66)
  // ============================================================================
  // O capô compartilha EXATAMENTE os vértices (xDeck, yDeck) das estações 0..4,
  // porém o centro (X=0) avança mais à frente que as pontas laterais, criando a
  // silhueta frontal arredondada do conceito `1 · Compacto`!
  const hoodRows = [
    // zCenter, yCenter, zMid,  xMid, yMid, zDeck, xDeck, yDeck (xDeck,yDeck,zDeck = sideStations[0..4])
    [-1.60,     0.78,    -1.57, 0.36, 0.78, -1.52, 0.63,  0.78], // idx 0
    [-1.47,     0.85,    -1.45, 0.40, 0.85, -1.42, 0.70,  0.84], // idx 1
    [-1.36,     0.90,    -1.35, 0.44, 0.89, -1.33, 0.73,  0.89], // idx 2
    [-1.18,     0.95,    -1.17, 0.47, 0.94, -1.16, 0.75,  0.94], // idx 3
    [-0.92,     0.99,    -0.92, 0.50, 0.98, -0.92, 0.76,  0.97], // idx 4 (Base do para-brisa!)
  ];

  for (let i = 0; i < hoodRows.length - 1; i++) {
    const H0 = hoodRows[i];
    const H1 = hoodRows[i + 1];
    for (const s of [-1, 1]) {
      const c0 = [0, H0[1], H0[0]], c1 = [0, H1[1], H1[0]];
      const m0 = [s * H0[3], H0[4], H0[2]], m1 = [s * H1[3], H1[4], H1[2]];
      const d0 = [s * H0[6], H0[7], H0[5]], d1 = [s * H1[6], H1[7], H1[5]];
      addQuad('body', c0, c1, m1, m0, pal.body, [s * 0.1, 1, -0.3]);
      addQuad('body', m0, m1, d1, d0, pal.body, [s * 0.35, 0.9, -0.3]);
    }
  }

  // Grade frontal unificada (conectada 100% com hoodRows[0] e sideStations[0]):
  for (const s of [-1, 1]) {
    const fGrid = [
      // Row 0: Borda frontal do capô (conecta 100% com hoodRows[0] e sideStations[0])
      [[0, 0.78, -1.60], [s * 0.36, 0.78, -1.57], [s * 0.63, 0.78, -1.52], [s * 0.73, 0.74, -1.52]],
      // Row 1: Topo do nariz / topo dos faróis
      [[0, 0.71, -1.66], [s * 0.36, 0.70, -1.63], [s * 0.61, 0.70, -1.57], [s * 0.73, 0.74, -1.52]],
      // Row 2: Meio dos faróis
      [[0, 0.64, -1.68], [s * 0.38, 0.63, -1.65], [s * 0.62, 0.63, -1.58], [s * 0.75, 0.62, -1.52]],
      // Row 3: Base dos faróis / para-choque superior
      [[0, 0.56, -1.69], [s * 0.40, 0.56, -1.66], [s * 0.61, 0.56, -1.59], [s * 0.76, 0.49, -1.52]],
      // Row 4: Topo da grade trapezoidal inferior
      [[0, 0.44, -1.68], [s * 0.44, 0.44, -1.65], [s * 0.60, 0.45, -1.59], [s * 0.76, 0.49, -1.52]],
      // Row 5: Base do para-choque dianteiro
      [[0, 0.25, -1.63], [s * 0.52, 0.25, -1.60], [s * 0.62, 0.25, -1.56], [s * 0.70, 0.25, -1.52]],
    ];

    for (let r = 0; r < fGrid.length - 1; r++) {
      for (let c = 0; c < 3; c++) {
        const p00 = fGrid[r][c];
        const p01 = fGrid[r][c + 1];
        const p11 = fGrid[r + 1][c + 1];
        const p10 = fGrid[r + 1][c];

        if (Math.hypot(p01[0] - p11[0], p01[1] - p11[1], p01[2] - p11[2]) < 1e-4) {
          addTri('body', p00, p01, p10, pal.body);
          continue;
        }

        let grp = 'body';
        let col = pal.body;
        if (r === 1 && (c === 1 || c === 2)) {
          grp = 'headLights';
          col = pal.headDrls;
        } else if (r === 2 && (c === 1 || c === 2)) {
          grp = 'headLights';
          col = pal.headMain;
        } else if (r === 4 && c === 0) {
          grp = 'trim';
          col = pal.bumperTrim;
        }
        addQuad(grp, p00, p01, p11, p10, col, [s * 0.25 * c, 0.2 - r * 0.08, -1]);
      }
    }

    addPoly(
      'trim',
      [
        [0, 0.25, -1.63],
        [s * 0.52, 0.25, -1.60],
        [s * 0.62, 0.25, -1.56],
        [s * 0.70, 0.25, -1.52],
        [s * 0.48, 0.22, -1.58],
        [0, 0.22, -1.58],
      ],
      pal.underbody,
      [0, -1, -0.2]
    );
  }

  // ============================================================================
  // 3. CABINE HATCHBACK FIEL À REFERÊNCIA (TETO LONGO + VIGIA ÍNGREME + COLUNA C)
  // ============================================================================
  // Alinhada com sideStations[4..15] (Z = -0.92 até +1.50):
  // Veja como o teto permanece alto até idx 7 (Z = +0.83) e a dobra do vigia traseiro
  // ocorre em idx 8 (Z = +0.99), dando ao carro a silhueta exata de Hatchback Compacto!
  const cabinStations = [
    // z,     yGlassC, yGlassE, xGlass, xRailPeak, yRailPeak, xRailOut, yRailOut, xDeck, yDeck
    /* 0 (st4) */ [-0.92, 0.99, 0.98, 0.50, 0.50, 0.98,  0.76, 0.97, 0.76, 0.97],
    /* 1 (st5) */ [-0.75, 1.14, 1.13, 0.50, 0.51, 1.145, 0.72, 1.12, 0.76, 0.99],
    /* 2 (st6) */ [-0.65, 1.22, 1.21, 0.50, 0.51, 1.225, 0.69, 1.20, 0.76, 1.00],
    /* 3 (st7) */ [-0.30, 1.40, 1.39, 0.50, 0.51, 1.410, 0.64, 1.38, 0.76, 1.02],
    /* 4 (st8) */ [ 0.14, 1.46, 1.45, 0.51, 0.52, 1.468, 0.64, 1.44, 0.76, 1.04],
    /* 5 (st9) */ [ 0.60, 1.45, 1.44, 0.50, 0.51, 1.458, 0.64, 1.43, 0.75, 1.06],
    /* 6 (st10)*/ [ 0.72, 1.43, 1.42, 0.49, 0.50, 1.438, 0.64, 1.40, 0.74, 1.08],
    /* 7 (st11)*/ [ 0.83, 1.40, 1.39, 0.48, 0.49, 1.408, 0.64, 1.37, 0.73, 1.09], // Topo da coluna C!
    /* 8 (st12)*/ [ 0.99, 1.34, 1.33, 0.48, 0.49, 1.348, 0.66, 1.31, 0.71, 1.11], // Canto traseiro da janela lateral!
    /* 9 (st13)*/ [ 1.23, 1.20, 1.19, 0.49, 0.50, 1.208, 0.66, 1.18, 0.67, 1.09], // Meio da coluna C / vigia
    /*10 (st14)*/ [ 1.40, 1.09, 1.08, 0.49, 0.50, 1.095, 0.62, 1.07, 0.63, 1.05],
    /*11 (st15)*/ [ 1.50, 1.03, 1.03, 0.48, 0.48, 1.030, 0.58, 1.02, 0.58, 1.02],
  ];

  // 3A. Vidro Panorâmico Contínuo (Para-brisa + Teto + Vigia Traseiro)
  for (let i = 0; i < cabinStations.length - 1; i++) {
    const C0 = cabinStations[i];
    const C1 = cabinStations[i + 1];
    const gCol = (i >= 3 && i <= 7) ? pal.glassRoof : pal.glass;
    for (const s of [-1, 1]) {
      const c0 = [0, C0[1], C0[0]], c1 = [0, C1[1], C1[0]];
      const e0 = [s * C0[3], C0[2], C0[0]], e1 = [s * C1[3], C1[2], C1[0]];
      addQuad('glass', c0, c1, e1, e0, gCol, [s * 0.08, 0.9, i < 3 ? -0.4 : i > 7 ? 0.4 : 0]);
    }
  }

  // 3B. Arcos Laterais Laranja do Teto
  for (const s of [-1, 1]) {
    for (let i = 0; i < cabinStations.length - 1; i++) {
      const C0 = cabinStations[i];
      const C1 = cabinStations[i + 1];
      const g0  = [s * C0[3], C0[2], C0[0]], g1  = [s * C1[3], C1[2], C1[0]];
      const pk0 = [s * C0[4], C0[5], C0[0]], pk1 = [s * C1[4], C1[5], C1[0]];
      const ro0 = [s * C0[6], C0[7], C0[0]], ro1 = [s * C1[6], C1[7], C1[0]];

      if (
        Math.hypot(g0[0] - pk0[0], g0[1] - pk0[1]) > 1e-4 ||
        Math.hypot(g1[0] - pk1[0], g1[1] - pk1[1]) > 1e-4
      ) {
        addQuad('body', g0, g1, pk1, pk0, pal.bodyAccent, [-s * 0.7, 0.7, 0]);
      }
      addQuad('body', pk0, pk1, ro1, ro0, pal.body, [s * 0.45, 0.88, 0]);
    }
  }

  // 3C. Janelas Laterais Longas (i=1..8, Z=-0.75 a +0.99) + Coluna C Compacta (i=8..11, Z=+0.99 a +1.50)
  for (const s of [-1, 1]) {
    // 1) Base da Coluna A (i=0..1)
    {
      const C0 = cabinStations[0], C1 = cabinStations[1];
      const ro0 = [s * C0[6], C0[7], C0[0]], ro1 = [s * C1[6], C1[7], C1[0]];
      const dk1 = [s * C1[8], C1[9], C1[0]];
      addTri('body', ro0, ro1, dk1, pal.body);
    }

    // 2) Coluna C de Hatchback (i=8..11, Z=+0.99 até +1.50)
    for (let i = 8; i < 11; i++) {
      const C0 = cabinStations[i], C1 = cabinStations[i + 1];
      const ro0 = [s * C0[6], C0[7], C0[0]], ro1 = [s * C1[6], C1[7], C1[0]];
      const dk0 = [s * C0[8], C0[9], C0[0]], dk1 = [s * C1[8], C1[9], C1[0]];
      if (Math.hypot(ro1[0] - dk1[0], ro1[1] - dk1[1]) < 1e-4) {
        addTri('body', ro0, ro1, dk0, pal.body);
      } else {
        addQuad('body', ro0, ro1, dk1, dk0, pal.body, [s, 0.35, 0.15]);
      }
    }

    // 3) Área envidraçada lateral (entre i=1 em Z=-0.75 e i=8 em Z=+0.99)
    const winStations = cabinStations.slice(1, 9); // 8 estações: idx 0..7 (correspondentes a cabinStations 1..8)
    const lastIdx = winStations.length - 1;
    const insetX = -s * 0.022;

    const topOuter = winStations.map((C, idx) =>
      idx === lastIdx ? [s * 0.65, 1.34, 0.88] : [s * C[6], C[7], C[0]]
    );
    const botOuter = winStations.map(C => [s * C[8], C[9], C[0]]);

    // Na estação 8 (idx=lastIdx), o canto superior da janela fica alto em (Y=1.30, Z=0.86)
    // e o canto inferior fica em (Y=1.12, Z=0.97), formando a borda traseira trapezoidal
    // alta idêntica à referência `Orange Hatchback in Rear Three-Quarter View.png`!
    const topInner = winStations.map((C, idx) => {
      if (idx === 0) return [s * C[8] + insetX, C[9] + 0.02, C[0] + 0.03];
      if (idx === lastIdx) return [s * 0.66 + insetX, 1.30, 0.86];
      return [s * C[6] + s * 0.012 + insetX, C[7] - 0.035, C[0]];
    });
    const botInner = winStations.map((C, idx) => [
      s * C[8] + insetX,
      C[9] + 0.015,
      C[0] + (idx === 0 ? 0.03 : idx === lastIdx ? -0.02 : 0),
    ]);

    // Conecta o topo da janela em Z=0.88 até a estação 8 do arco do teto (Z=0.99)
    addTri(
      'body',
      [s * cabinStations[7][6], cabinStations[7][7], cabinStations[7][0]],
      [s * cabinStations[8][6], cabinStations[8][7], cabinStations[8][0]],
      topOuter[lastIdx],
      pal.body
    );
    addQuad(
      'body',
      topOuter[lastIdx],
      [s * cabinStations[8][6], cabinStations[8][7], cabinStations[8][0]],
      botOuter[lastIdx],
      botOuter[lastIdx],
      pal.body,
      [s, 0.35, 0.1]
    );

    for (let k = 0; k < lastIdx; k++) {
      addQuad('body', topOuter[k], topOuter[k + 1], topInner[k + 1], topInner[k], pal.body, [s, 0.15, 0]);
      addQuad('body', botInner[k], botInner[k + 1], botOuter[k + 1], botOuter[k], pal.bodyAccent, [s * 0.3, 0.9, 0]);
    }
    addQuad('body', botOuter[0], topOuter[0], topInner[0], botInner[0], pal.body, [s, 0.2, 0.5]);
    addQuad('body', topOuter[lastIdx], botOuter[lastIdx], botInner[lastIdx], topInner[lastIdx], pal.bodyAccent, [s, 0.2, -0.5]);

    for (let k = 0; k < lastIdx; k++) {
      if (k === 3) {
        // Coluna B na estação k=3 (Z = +0.14)
        const bFrac = 0.12;
        const bTop = [
          topInner[3][0] + (topInner[4][0] - topInner[3][0]) * bFrac,
          topInner[3][1] + (topInner[4][1] - topInner[3][1]) * bFrac,
          topInner[3][2] + (topInner[4][2] - topInner[3][2]) * bFrac,
        ];
        const bBot = [
          botInner[3][0] + (botInner[4][0] - botInner[3][0]) * bFrac,
          botInner[3][1] + (botInner[4][1] - botInner[3][1]) * bFrac,
          botInner[3][2] + (botInner[4][2] - botInner[3][2]) * bFrac,
        ];
        addQuad('trim', botInner[3], bBot, bTop, topInner[3], pal.pillarDark, [s, 0.25, 0]);
        addQuad('glass', bBot, botInner[4], topInner[4], bTop, pal.glass, [s, 0.25, 0]);
      } else {
        addQuad('glass', botInner[k], botInner[k + 1], topInner[k + 1], topInner[k], pal.glass, [s, 0.25, 0]);
      }
    }
  }

  // ============================================================================
  // 4. TRASEIRA ESTANQUE EM MALHA UNIFICADA (VIGIA CURVO, LANTERNAS E DIFUSOR)
  // ============================================================================
  // Conecta-se 100% aos vértices de cabinStations[11] / sideStations[15] (Z=1.50) e sideStations[16] (Z=1.64)!
  for (const s of [-1, 1]) {
    const rGrid = [
      // Row 0 (Z=1.50): Base superior do vigia / coluna C (conecta 100% com cabinStations[11])
      [[0, 1.03, 1.50], [s * 0.26, 1.03, 1.50], [s * 0.48, 1.03, 1.50], [s * 0.58, 1.02, 1.50]],
      // Row 1 (Z=1.59..1.64): Curva inferior do vigia traseiro + quina superior da tampa
      [[0, 0.97, 1.61], [s * 0.27, 0.98, 1.59], [s * 0.48, 1.03, 1.50], [s * 0.54, 0.97, 1.64]],
      // Row 2: Topo das lanternas traseiras (inclinado agressivamente para baixo rumo ao centro como na ref!)
      [[0, 0.85, 1.76], [s * 0.37, 0.85, 1.75], [s * 0.55, 0.90, 1.70], [s * 0.73, 0.94, 1.64]],
      // Row 3: Vinco central das lanternas traseiras
      [[0, 0.79, 1.79], [s * 0.39, 0.79, 1.78], [s * 0.56, 0.82, 1.73], [s * 0.75, 0.85, 1.64]],
      // Row 4: Base das lanternas traseiras
      [[0, 0.73, 1.79], [s * 0.43, 0.73, 1.78], [s * 0.56, 0.75, 1.74], [s * 0.74, 0.78, 1.64]],
      // Row 5: Degrau / prateleira superior do para-choque traseiro
      [[0, 0.65, 1.83], [s * 0.44, 0.65, 1.82], [s * 0.60, 0.65, 1.77], [s * 0.77, 0.52, 1.64]],
      // Row 6: Topo do difusor preto trapezoidal
      [[0, 0.43, 1.82], [s * 0.47, 0.43, 1.81], [s * 0.62, 0.44, 1.75], [s * 0.77, 0.52, 1.64]],
      // Row 7: Base do para-choque traseiro / base do difusor trapezoidal
      [[0, 0.25, 1.77], [s * 0.57, 0.25, 1.76], [s * 0.65, 0.25, 1.71], [s * 0.73, 0.25, 1.64]],
    ];

    for (let r = 0; r < rGrid.length - 1; r++) {
      for (let c = 0; c < 3; c++) {
        const p00 = rGrid[r][c];
        const p01 = rGrid[r][c + 1];
        const p11 = rGrid[r + 1][c + 1];
        const p10 = rGrid[r + 1][c];

        const dRight = Math.hypot(p01[0] - p11[0], p01[1] - p11[1], p01[2] - p11[2]);
        const dLeft  = Math.hypot(p00[0] - p10[0], p00[1] - p10[1], p00[2] - p10[2]);

        let grp = 'body';
        let col = pal.body;

        if (r === 0 && (c === 0 || c === 1)) {
          grp = 'glass';
          col = pal.glass;
        } else if (r === 2 && (c === 1 || c === 2)) {
          grp = 'tailLights';
          col = pal.tailUpper;
        } else if (r === 3 && (c === 1 || c === 2)) {
          grp = 'tailLights';
          col = pal.tailLower;
        } else if (r === 6 && c === 0) {
          grp = 'trim';
          col = pal.bumperTrim;
        }

        const hint = [s * 0.25 * c, 0.25 - r * 0.06, 1];
        if (dRight < 1e-4) {
          addPoly(grp, [p00, p01, p10], col, hint);
        } else if (dLeft < 1e-4) {
          addPoly(grp, [p00, p01, p11], col, hint);
        } else {
          addQuad(grp, p00, p01, p11, p10, col, hint);
        }
      }
    }

    // Fechamento lateral entre a coluna 3 da grade traseira (Z=1.64) e a borda de sideStations[15..16]
    const st15Deck = [s * 0.58, 1.02, 1.50];
    const st15Belt = [s * 0.80, 0.98, 1.50];
    const st16Deck = [s * 0.54, 0.97, 1.64];
    const st16Belt = [s * 0.73, 0.94, 1.64];
    const st16Flare = [s * 0.77, 0.52, 1.64];
    addPoly('body', [st15Deck, st15Belt, st16Belt, st16Deck], pal.body, [s * 0.5, 0.8, 0.3]);
    addPoly(
      'body',
      [st16Belt, [s * 0.75, 0.85, 1.64], [s * 0.74, 0.78, 1.64], st16Flare],
      pal.body,
      [s, 0.1, 0.3]
    );

    addPoly(
      'trim',
      [
        [0, 0.25, 1.77],
        [s * 0.57, 0.25, 1.76],
        [s * 0.65, 0.25, 1.71],
        [s * 0.73, 0.25, 1.64],
        [s * 0.48, 0.23, 1.70],
        [0, 0.23, 1.70],
      ],
      pal.underbody,
      [0, -1, 0.2]
    );
  }

  // ============================================================================
  // 5. RETROVISORES LATERAIS FACETADOS 100% LARANJA (COMO NA REFERÊNCIA!)
  // ============================================================================
  for (const s of [-1, 1]) {
    const stInF = [s * 0.75, 1.00, -0.58];
    const stInR = [s * 0.75, 1.00, -0.49];
    const stOutF = [s * 0.87, 1.03, -0.56];
    const stOutR = [s * 0.87, 1.03, -0.48];
    const stInBotF = [s * 0.77, 0.95, -0.58];
    const stInBotR = [s * 0.77, 0.95, -0.49];
    const stOutBotF = [s * 0.87, 0.98, -0.56];
    const stOutBotR = [s * 0.87, 0.98, -0.48];

    addQuad('body', stInF, stOutF, stOutR, stInR, pal.body, [0, 1, 0]);
    addQuad('body', stInBotF, stInBotR, stOutBotR, stOutBotF, pal.bodyAccent, [0, -1, 0]);
    addQuad('body', stInF, stInBotF, stOutBotF, stOutF, pal.body, [0, 0, -1]);
    addQuad('body', stInR, stOutR, stOutBotR, stInBotR, pal.body, [0, 0, 1]);

    const ringFront = [
      [s * 0.86, 0.97, -0.59],
      [s * 1.02, 0.97, -0.57],
      [s * 1.06, 1.02, -0.56],
      [s * 1.05, 1.09, -0.56],
      [s * 0.99, 1.11, -0.57],
      [s * 0.86, 1.10, -0.59],
    ];
    const ringRear = [
      [s * 0.86, 0.97, -0.45],
      [s * 1.03, 0.97, -0.45],
      [s * 1.07, 1.02, -0.45],
      [s * 1.06, 1.09, -0.45],
      [s * 1.00, 1.11, -0.45],
      [s * 0.86, 1.10, -0.45],
    ];
    const noseTip = [s * 0.96, 1.035, -0.62];
    const rearCap = [s * 0.96, 1.035, -0.435];
    for (let k = 0; k < 6; k++) {
      const kn = (k + 1) % 6;
      addQuad('body', ringFront[k], ringFront[kn], ringRear[kn], ringRear[k], pal.body, [
        (ringFront[k][0] + ringFront[kn][0]) * 0.5 - s * 0.96,
        (ringFront[k][1] + ringFront[kn][1]) * 0.5 - 1.035,
        0,
      ]);
      addPoly('body', [noseTip, ringFront[k], ringFront[kn]], pal.body, [0, 0, -1]);
      addPoly('body', [rearCap, ringRear[k], ringRear[kn]], pal.bodyAccent, [0, 0, 1]);
    }
  }

  // ============================================================================
  // 6. QUATRO RODAS LOW-POLY COM PNEU CHANFRADO E CALOTA CENTRAL ESCURA
  // ============================================================================
  function buildWheel(groupName, s, zCenter) {
    const N = 20;
    const yCenter = 0.37;
    const rOuter = 0.37;
    const rShoulder = 0.325;
    const rRim = 0.225;
    const rHub = 0.195;

    const xInEdge    = s * 0.64;
    const xInTread   = s * 0.67;
    const xOutTread  = s * 0.88;
    const xOutSide   = s * 0.915;
    const xRimRecess = s * 0.895;
    const xHubFace   = s * 0.908;

    const ring = (x, r) =>
      Array.from({ length: N }, (_, i) => {
        const th = (i / N) * Math.PI * 2;
        return [x, yCenter + Math.cos(th) * r, zCenter + Math.sin(th) * r];
      });

    const r0 = ring(xInEdge, rShoulder);
    const r1 = ring(xInTread, rOuter);
    const r2 = ring(xOutTread, rOuter);
    const r3 = ring(xOutSide, rShoulder);
    const r4 = ring(xRimRecess, rRim);
    const r5 = ring(xHubFace, rHub);

    const stitchRing = (ringA, ringB, col, normalXHint) => {
      for (let i = 0; i < N; i++) {
        const ip = (i + 1) % N;
        const ym = ((ringA[i][1] + ringB[ip][1]) * 0.5) - yCenter;
        const zm = ((ringA[i][2] + ringB[ip][2]) * 0.5) - zCenter;
        addQuad(groupName, ringA[i], ringA[ip], ringB[ip], ringB[i], col, [normalXHint, ym, zm]);
      }
    };

    stitchRing(r0, r1, pal.tire, -s * 0.5);
    stitchRing(r1, r2, pal.tire, 0);
    stitchRing(r2, r3, pal.tireSide, s * 0.6);
    stitchRing(r3, r4, pal.tireSide, s * 0.9);
    stitchRing(r4, r5, pal.rimLip, s * 0.5);

    addPoly(groupName, r0, pal.underbody, [-s, 0, 0]);
    addPoly(groupName, r5, pal.hubcap, [s, 0, 0]);
  }

  buildWheel('wheelFL', -1, -1.04);
  buildWheel('wheelFR',  1, -1.04);
  buildWheel('wheelRL', -1,  1.10);
  buildWheel('wheelRR',  1,  1.10);

  // ============================================================================
  // 7. CONSOLIDAÇÃO DE BUFFERS
  // ============================================================================
  const allPositions = [];
  const allNormals = [];
  const allColors = [];
  const allPartIds = [];

  for (const g of Object.values(groups)) {
    const vCount = g.positions.length / 3;
    g.triangles = vCount / 3;
    for (let i = 0; i < g.positions.length; i++) {
      allPositions.push(g.positions[i]);
      allNormals.push(g.normals[i]);
      allColors.push(g.colors[i]);
    }
    for (let v = 0; v < vCount; v++) {
      allPartIds.push(g.partId);
    }
  }

  return {
    name: 'VANO_Compacto',
    palette: paletteHex,
    groups,
    positions: new Float32Array(allPositions),
    normals: new Float32Array(allNormals),
    colors: new Float32Array(allColors),
    partIds: new Float32Array(allPartIds),
    triangles: allPositions.length / 9,
    vertices: allPositions.length / 3,
    bounds: {
      width: 2.14,
      height: 1.47,
      length: 3.52,
      wheelbase: 2.14,
    },
  };
}

export function createThreeVanoCompacto(THREE, options = {}) {
  const model = createVanoCompacto(options);
  const root = new THREE.Group();
  root.name = 'VANO_Compacto';

  const matConfig = {
    body:      { roughness: 0.46, metalness: 0.08, clearcoat: 0.35, clearcoatRoughness: 0.25 },
    glass:     { roughness: 0.18, metalness: 0.15, clearcoat: 0.80, clearcoatRoughness: 0.08 },
    trim:      { roughness: 0.82, metalness: 0.05 },
    tailLights:{ roughness: 0.28, metalness: 0.10, emissive: new THREE.Color('#8f0e0a'), emissiveIntensity: 0.35 },
    headLights:{ roughness: 0.22, metalness: 0.10, emissive: new THREE.Color('#dceeff'), emissiveIntensity: 0.45 },
    wheel:     { roughness: 0.86, metalness: 0.08 },
  };

  const wheels = {};

  for (const [key, g] of Object.entries(model.groups)) {
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(g.positions);
    const normArr = new Float32Array(g.normals);
    const colArr = new Float32Array(g.colors.length);

    for (let i = 0; i < g.colors.length; i++) {
      colArr[i] = srgbToLinear(g.colors[i]);
    }

    const isWheel = Boolean(g.pivot);
    if (isWheel) {
      const [px, py, pz] = g.pivot;
      for (let i = 0; i < posArr.length; i += 3) {
        posArr[i]     -= px;
        posArr[i + 1] -= py;
        posArr[i + 2] -= pz;
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    geo.computeBoundingSphere();

    const cfg = isWheel ? matConfig.wheel : (matConfig[key] || matConfig.body);
    const MatCtor = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    const mat = new MatCtor({
      vertexColors: true,
      flatShading: true,
      ...cfg,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = g.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (isWheel) {
      const steerPivot = new THREE.Group();
      steerPivot.name = `${g.name}_Steer`;
      steerPivot.position.set(g.pivot[0], g.pivot[1], g.pivot[2]);
      steerPivot.add(mesh);
      root.add(steerPivot);
      wheels[key] = { steerPivot, spinMesh: mesh };
    } else {
      root.add(mesh);
    }
  }

  root.userData = {
    triangles: model.triangles,
    wheels,
    setSteering(angleRad) {
      if (wheels.wheelFL) wheels.wheelFL.steerPivot.rotation.y = angleRad;
      if (wheels.wheelFR) wheels.wheelFR.steerPivot.rotation.y = angleRad;
    },
    spinWheels(deltaRad) {
      for (const w of Object.values(wheels)) {
        w.spinMesh.rotation.x -= deltaRad;
      }
    },
  };

  return root;
}

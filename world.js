// ==========================================
// ФАЙЛ: world.js
// Хранение вокселей, генерация ландшафта и деревень на основе Seed
// (Добавлена генерация руд и новые виды деревьев)
// ==========================================

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 128;

const BLOCK = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    WOOD: 4,
    LEAVES: 5,
    PLANK: 6,
    COBBLESTONE: 7,
    GLASS: 8,
    SAND: 9,
    WATER: 10,
    BEDROCK: 11,
    GRAVEL: 12,
    FLOWER: 13,
    CRAFTING_TABLE: 14, // НОВЫЙ БЛОК: Верстак
    CHEST: 20,
    COAL_ORE: 21,
    IRON_ORE: 22,
    GOLD_ORE: 23,
    DIAMOND_ORE: 24,
    
    // ПРЕДМЕТЫ И ИНСТРУМЕНТЫ (Не ставятся в мире)
    STICK: 30,
    WOODEN_SWORD: 31, WOODEN_SHOVEL: 32, WOODEN_PICKAXE: 33, WOODEN_AXE: 34, WOODEN_HOE: 35,
    STONE_SWORD: 36, STONE_SHOVEL: 37, STONE_PICKAXE: 38, STONE_AXE: 39, STONE_HOE: 40
};

// Процедурный генератор псевдослучайных чисел на основе Seed (Mulberry32)
class SeededPRNG {
    constructor(seed) {
        this.seed = (seed ^ 0xdeadbeef) >>> 0;
    }
    next() {
        let t = (this.seed += 0x6D2B79F5) >>> 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

function hash2D(x, z, seed) {
    let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1274126177);
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

function smoothNoise(x, z, seed) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;

    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);

    const v00 = hash2D(ix, iz, seed);
    const v10 = hash2D(ix + 1, iz, seed);
    const v01 = hash2D(ix, iz + 1, seed);
    const v11 = hash2D(ix + 1, iz + 1, seed);

    return v00 * (1 - ux) * (1 - uz) +
           v10 * ux * (1 - uz) +
           v01 * (1 - ux) * uz +
           v11 * ux * uz;
}

class Chunk {
    constructor(cx, cz) {
        this.cx = cx;
        this.cz = cz;
        this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
        this.mesh = null;
        this.isDirty = false;
    }

    getIndex(x, y, z) { return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE; }

    getBlock(x, y, z) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return BLOCK.AIR;
        return this.blocks[this.getIndex(x, y, z)];
    }

    setBlock(x, y, z, val) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return;
        this.blocks[this.getIndex(x, y, z)] = val;
        this.isDirty = true;
    }
}

class World {
    constructor(seed = 123456789) {
        this.seed = seed;
        this.chunks = {};
        this.spawnedVillages = new Set();
        this.modifiedBlocks = new Map();
        this.loadModifiedBlocks();
    }

    getChunkKey(cx, cz) { return `${cx},${cz}`; }

    getBlockWorld(x, y, z) {
        if (y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
        const modKey = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
        if (this.modifiedBlocks.has(modKey)) return this.modifiedBlocks.get(modKey);

        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const key = this.getChunkKey(cx, cz);
        const chunk = this.chunks[key];
        if (!chunk) return BLOCK.AIR;

        const bx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const bz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        return chunk.getBlock(bx, y, bz);
    }

    setBlockWorld(x, y, z, val) {
        if (y < 0 || y >= CHUNK_HEIGHT) return;
        const fx = Math.floor(x);
        const fy = Math.floor(y);
        const fz = Math.floor(z);
        
        const modKey = `${fx},${fy},${fz}`;
        this.modifiedBlocks.set(modKey, val);
        this.saveModifiedBlocks();

        const cx = Math.floor(fx / CHUNK_SIZE);
        const cz = Math.floor(fz / CHUNK_SIZE);
        const key = this.getChunkKey(cx, cz);
        let chunk = this.chunks[key];
        if (!chunk) {
            chunk = this.generateChunk(cx, cz);
            this.chunks[key] = chunk;
        }

        const bx = ((fx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const bz = ((fz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        chunk.setBlock(bx, fy, bz, val);
    }

    saveModifiedBlocks() {
        try {
            const data = Array.from(this.modifiedBlocks.entries());
            localStorage.setItem(`jscraft_mods_${this.seed}`, JSON.stringify(data));
        } catch (e) { console.error("Ошибка сохранения модификаций мира:", e); }
    }

    loadModifiedBlocks() {
        try {
            const saved = localStorage.getItem(`jscraft_mods_${this.seed}`);
            if (saved) {
                const data = JSON.parse(saved);
                this.modifiedBlocks = new Map(data);
            }
        } catch (e) {
            this.modifiedBlocks = new Map();
        }
    }

    getSurfaceHeight(x, z) {
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            const b = this.getBlockWorld(x, y, z);
            if (b !== BLOCK.AIR && b !== BLOCK.LEAVES && b !== BLOCK.WATER) return y;
        }
        return 60;
    }

    generateChunk(cx, cz) {
        const chunk = new Chunk(cx, cz);

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const wx = cx * CHUNK_SIZE + x;
                const wz = cz * CHUNK_SIZE + z;

                const e1 = smoothNoise(wx * 0.01, wz * 0.01, this.seed);
                const e2 = smoothNoise(wx * 0.03, wz * 0.03, this.seed + 100);
                const e3 = smoothNoise(wx * 0.08, wz * 0.08, this.seed + 200);
                
                let height = Math.floor(58 + e1 * 28 + e2 * 12 + e3 * 5);
                
                const riverNoise = smoothNoise(wx * 0.015, wz * 0.015, this.seed + 500);
                if (riverNoise < 0.22 && riverNoise > 0.18) height -= 6; 

                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    if (y === 0) chunk.setBlock(x, y, z, BLOCK.BEDROCK);
                    else if (y < height - 4) chunk.setBlock(x, y, z, BLOCK.STONE);
                    else if (y < height) chunk.setBlock(x, y, z, BLOCK.DIRT);
                    else if (y === height) {
                        if (height <= 60) chunk.setBlock(x, y, z, BLOCK.SAND);
                        else chunk.setBlock(x, y, z, BLOCK.GRASS);
                    }
                    else if (y <= 60 && y > height) chunk.setBlock(x, y, z, BLOCK.WATER);
                    else chunk.setBlock(x, y, z, BLOCK.AIR);
                }
            }
        }

        // Посадка лесов (исправлено с учетом разнообразия)
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const wx = cx * CHUNK_SIZE + x;
                const wz = cz * CHUNK_SIZE + z;

                const forestNoise = smoothNoise(wx * 0.02, wz * 0.02, this.seed + 300);
                if (forestNoise > 0.55) {
                    const treeHash = hash2D(wx, wz, this.seed + 777);
                    if (treeHash < 0.08) { // Немного уменьшен шанс, чтобы лес был красивее
                        const terrainY = this.getChunkSurfaceY(chunk, x, z);
                        if (terrainY >= 60 && chunk.getBlock(x, terrainY, z) === BLOCK.GRASS) {
                            this.buildTree(chunk, x, terrainY + 1, z, treeHash);
                        }
                    }
                }
            }
        }

        this.generateOreVeins(chunk, cx, cz, this.seed);
        this.generateVillageElementsForChunk(chunk, cx, cz);

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    const wx = cx * CHUNK_SIZE + x;
                    const wz = cz * CHUNK_SIZE + z;
                    const modKey = `${wx},${y},${wz}`;
                    if (this.modifiedBlocks.has(modKey)) {
                        chunk.setBlock(x, y, z, this.modifiedBlocks.get(modKey));
                    }
                }
            }
        }

        return chunk;
    }

    generateOreVeins(chunk, cx, cz, worldSeed) {
        const chunkSeed = Math.imul(cx, 1597334677) ^ Math.imul(cz, 3812015801) ^ worldSeed;
        const prng = new SeededPRNG(chunkSeed);

        this.placeVeins(chunk, prng, BLOCK.COAL_ORE, 25, 5, 120, 5, 16);
        this.placeVeins(chunk, prng, BLOCK.IRON_ORE, 15, 5, 60, 4, 10);
        this.placeVeins(chunk, prng, BLOCK.GOLD_ORE, 6, 5, 32, 3, 8);
        this.placeVeins(chunk, prng, BLOCK.DIAMOND_ORE, 3, 1, 16, 1, 5);
    }

    placeVeins(chunk, prng, blockId, count, minHeight, maxHeight, minSize, maxSize) {
        for (let i = 0; i < count; i++) {
            let cx = Math.floor(prng.next() * CHUNK_SIZE);
            let cy = minHeight + Math.floor(prng.next() * (maxHeight - minHeight));
            let cz = Math.floor(prng.next() * CHUNK_SIZE);
            let size = minSize + Math.floor(prng.next() * (maxSize - minSize + 1));

            for (let j = 0; j < size; j++) {
                if (cx >= 0 && cx < CHUNK_SIZE && cy >= 0 && cy < CHUNK_HEIGHT && cz >= 0 && cz < CHUNK_SIZE) {
                    if (chunk.getBlock(cx, cy, cz) === BLOCK.STONE) {
                        chunk.setBlock(cx, cy, cz, blockId);
                    }
                }
                const r = prng.next();
                if (r < 0.16) cx++; else if (r < 0.33) cx--;
                else if (r < 0.5) cy++; else if (r < 0.66) cy--;
                else if (r < 0.83) cz++; else cz--;
            }
        }
    }

    getChunkSurfaceY(chunk, x, z) {
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            const b = chunk.getBlock(x, y, z);
            if (b !== BLOCK.AIR && b !== BLOCK.LEAVES && b !== BLOCK.WATER) return y;
        }
        return 60;
    }

    // Разнообразные деревья
    buildTree(chunk, tx, ty, tz, randomHash) {
        let height = 4; // маленькое
        if (randomHash < 0.02) height = 7; // большое
        else if (randomHash < 0.05) height = 5; // среднее

        // Ствол
        for (let h = 0; h < height; h++) {
            if (ty + h < CHUNK_HEIGHT) {
                chunk.setBlock(tx, ty + h, tz, BLOCK.WOOD);
            }
        }

        // Листва
        const leafBottom = ty + height - 2;
        const leafTop = ty + height + 1;
        
        for (let ny = leafBottom; ny <= leafTop; ny++) {
            // Крона сужается к вершине
            const radius = (ny >= ty + height) ? 1 : 2;
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    // Скругляем углы
                    if (Math.abs(dx) === radius && Math.abs(dz) === radius && (radius === 2 || randomHash > 0.04)) {
                        continue;
                    }
                    const nx = tx + dx;
                    const nz = tz + dz;
                    // Ограничение границ чанка. 
                    // Если дерево частично за гранью, листва просто обрезается (как в Minecraft Classic)
                    if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < CHUNK_HEIGHT) {
                        if (chunk.getBlock(nx, ny, nz) === BLOCK.AIR) {
                            chunk.setBlock(nx, ny, nz, BLOCK.LEAVES);
                        }
                    }
                }
            }
        }
    }

    getVillageInRegion(regionX, regionZ) {
        const regSeed = Math.imul(regionX, 1597334677) ^ Math.imul(regionZ, 3812015801) ^ this.seed;
        const prng = new SeededPRNG(regSeed);
        if (prng.next() > 0.60) return null;

        return {
            cx: regionX * 8 + Math.floor(prng.next() * 6) + 1,
            cz: regionZ * 8 + Math.floor(prng.next() * 6) + 1,
            worldX: (regionX * 8 + Math.floor(prng.next() * 6) + 1) * CHUNK_SIZE + 8,
            worldZ: (regionZ * 8 + Math.floor(prng.next() * 6) + 1) * CHUNK_SIZE + 8,
            houseCount: Math.floor(prng.next() * 5) + 3,
            hasFarm: prng.next() < 0.7,
            roadLength: Math.floor(prng.next() * 20) + 25,
            villagerCount: Math.floor(prng.next() * 5) + 3,
            prngSeed: regSeed
        };
    }

    generateVillageElementsForChunk(chunk, cx, cz) {
        const regionX = Math.floor(cx / 8);
        const regionZ = Math.floor(cz / 8);

        for (let rx = regionX - 1; rx <= regionX + 1; rx++) {
            for (let rz = regionZ - 1; rz <= regionZ + 1; rz++) {
                const village = this.getVillageInRegion(rx, rz);
                if (village && Math.abs(cx - village.cx) <= 2 && Math.abs(cz - village.cz) <= 2) {
                    this.buildVillageStructures(chunk, village);
                }
            }
        }
    }

    buildVillageStructures(chunk, village) {
        const prng = new SeededPRNG(village.prngSeed);
        const centerWx = village.worldX;
        const centerWz = village.worldZ;

        let floorY = 66;
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            const b = chunk.getBlock(8, y, 8);
            if (b !== BLOCK.AIR && b !== BLOCK.LEAVES && b !== BLOCK.WATER) { floorY = y; break; }
        }

        const halfRoad = Math.floor(village.roadLength / 2);
        for (let dx = -halfRoad; dx <= halfRoad; dx++) {
            for (let dz = -1; dz <= 1; dz++) this.placeRoadBlock(chunk, centerWx + dx, floorY, centerWz + dz);
        }
        for (let dz = -halfRoad; dz <= halfRoad; dz++) {
            for (let dx = -1; dx <= 1; dx++) this.placeRoadBlock(chunk, centerWx + dx, floorY, centerWz + dz);
        }

        const houseOffsets = [ [-8, -8], [8, -8], [-8, 8], [8, 8], [-16, -8], [16, 8], [-8, 16], [8, -16] ];
        for (let i = 0; i < village.houseCount && i < houseOffsets.length; i++) {
            const hx = centerWx + houseOffsets[i][0] + Math.floor(prng.next() * 4 - 2);
            const hz = centerWz + houseOffsets[i][1] + Math.floor(prng.next() * 4 - 2);
            this.generateHouseInChunk(chunk, hx, floorY, hz);
        }

        if (village.hasFarm) this.generateFarmInChunk(chunk, centerWx + 12, floorY, centerWz - 12);
    }

    placeRoadBlock(chunk, wx, wy, wz) {
        if (Math.floor(wx / CHUNK_SIZE) !== chunk.cx || Math.floor(wz / CHUNK_SIZE) !== chunk.cz) return;
        const bx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const bz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        
        for (let y = wy; y < CHUNK_HEIGHT; y++) chunk.setBlock(bx, y, bz, BLOCK.AIR);
        chunk.setBlock(bx, wy - 1, bz, BLOCK.COBBLESTONE);
    }

    generateHouseInChunk(chunk, hx, hy, hz) {
        const w = 5, h = 4, d = 5;
        for (let x = hx; x < hx + w; x++) {
            for (let z = hz; z < hz + d; z++) {
                if (Math.floor(x / CHUNK_SIZE) !== chunk.cx || Math.floor(z / CHUNK_SIZE) !== chunk.cz) continue;
                const bx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
                const bz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

                for (let y = hy + h; y < CHUNK_HEIGHT; y++) chunk.setBlock(bx, y, bz, BLOCK.AIR);
                for (let y = hy; y < hy + h; y++) {
                    const isEdgeX = (x === hx || x === hx + w - 1);
                    const isEdgeZ = (z === hz || z === hz + d - 1);
                    const isCeil = (y === hy + h - 1);
                    if (isEdgeX || isEdgeZ || isCeil) chunk.setBlock(bx, y, bz, BLOCK.PLANK);
                    else chunk.setBlock(bx, y, bz, BLOCK.AIR);
                }
            }
        }
        if (Math.floor((hx + 2) / CHUNK_SIZE) === chunk.cx && Math.floor(hz / CHUNK_SIZE) === chunk.cz) {
            chunk.setBlock((((hx + 2) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, hy + 1, ((hz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, BLOCK.GLASS);
        }
        if (Math.floor((hx + 1) / CHUNK_SIZE) === chunk.cx && Math.floor((hz + 3) / CHUNK_SIZE) === chunk.cz) {
            chunk.setBlock((((hx + 1) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, hy, (((hz + 3) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, BLOCK.COBBLESTONE);
        }
    }

    generateFarmInChunk(chunk, fx, fy, fz) {
        const w = 6, d = 6;
        for (let x = fx; x < fx + w; x++) {
            for (let z = fz; z < fz + d; z++) {
                if (Math.floor(x / CHUNK_SIZE) !== chunk.cx || Math.floor(z / CHUNK_SIZE) !== chunk.cz) continue;
                const bx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
                const bz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

                for (let y = fy; y < CHUNK_HEIGHT; y++) chunk.setBlock(bx, y, bz, BLOCK.AIR);
                if (x === fx || x === fx + w - 1 || z === fz || z === fz + d - 1) chunk.setBlock(bx, fy - 1, bz, BLOCK.WOOD);
                else if (x === fx + 2 && z === fz + 2) chunk.setBlock(bx, fy - 1, bz, BLOCK.WATER);
                else { chunk.setBlock(bx, fy - 1, bz, BLOCK.DIRT); chunk.setBlock(bx, fy, bz, BLOCK.GRASS); }
            }
        }
    }

    checkVillagerSpawns(game, cx, cz) {
        const regionX = Math.floor(cx / 8);
        const regionZ = Math.floor(cz / 8);
        const village = this.getVillageInRegion(regionX, regionZ);

        if (village && village.cx === cx && village.cz === cz) {
            const key = `${cx},${cz}`;
            if (this.spawnedVillages.has(key)) return;
            this.spawnedVillages.add(key);

            const prng = new SeededPRNG(village.prngSeed + 999);
            for (let i = 0; i < village.villagerCount; i++) {
                const vx = village.worldX + Math.floor(prng.next() * 16 - 8);
                const vz = village.worldZ + Math.floor(prng.next() * 16 - 8);
                const vy = this.getSurfaceHeight(vx, vz);
                const villager = new Villager(vx, vy + 1, vz, village.worldX, village.worldZ);
                game.mobManager.mobs.push(villager);
                game.scene.add(villager.mesh);
            }
        }
    }

    updateVisibleChunks(playerX, playerZ, scene, materials, game = window.gameInstance) {
        const pCx = Math.floor(playerX / CHUNK_SIZE);
        const pCz = Math.floor(playerZ / CHUNK_SIZE);
        const renderRadius = 4;

        for (let x = pCx - renderRadius; x <= pCx + renderRadius; x++) {
            for (let z = pCz - renderRadius; z <= pCz + renderRadius; z++) {
                const key = this.getChunkKey(x, z);
                let chunk = this.chunks[key];
                if (!chunk) {
                    chunk = this.generateChunk(x, z);
                    this.chunks[key] = chunk;
                }
                if (game) this.checkVillagerSpawns(game, x, z);
                if (chunk.isDirty || !chunk.mesh) this.rebuildChunkGeometry(chunk, scene, materials);
            }
        }
    }

    rebuildChunkGeometry(chunk, scene, materials) {
        if (chunk.mesh) scene.remove(chunk.mesh);

        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const uvs = [];
        const indices = [];
        let indexOffset = 0;

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    const block = chunk.getBlock(x, y, z);
                    if (block === BLOCK.AIR) continue;

                    const wx = chunk.cx * CHUNK_SIZE + x;
                    const wz = chunk.cz * CHUNK_SIZE + z;

                    const faces = [
                        { dir: [0, 0, 1], verts: [[0,0,1], [1,0,1], [1,1,1], [0,1,1]] },
                        { dir: [0, 0, -1], verts: [[1,0,0], [0,0,0], [0,1,0], [1,1,0]] },
                        { dir: [1, 0, 0], verts: [[1,0,1], [1,0,0], [1,1,0], [1,1,1]] },
                        { dir: [-1, 0, 0], verts: [[0,0,0], [0,0,1], [0,1,1], [0,1,0]] },
                        { dir: [0, 1, 0], verts: [[0,1,1], [1,1,1], [1,1,0], [0,1,0]] },
                        { dir: [0, -1, 0], verts: [[0,0,0], [1,0,0], [1,0,1], [0,0,1]] }
                    ];

                    faces.forEach((face) => {
                        const nx = wx + face.dir[0];
                        const ny = y + face.dir[1];
                        const nz = wz + face.dir[2];

                        const neighbor = this.getBlockWorld(nx, ny, nz);
                        if (neighbor === BLOCK.AIR || (neighbor === BLOCK.WATER && block !== BLOCK.WATER)) {
                            
                            // Кастомные UV для верстака
                            let faceTileIndex = block - 1;
                            if (block === BLOCK.CRAFTING_TABLE) {
                                if (face.dir[1] === 1) faceTileIndex = 14; // Верх (Сетка)
                                else if (face.dir[1] === -1) faceTileIndex = 5; // Низ (Доски)
                                else faceTileIndex = 13; // Бока (Инструменты)
                            }

                            const tu = faceTileIndex % 16;
                            const tv = Math.floor(faceTileIndex / 16);
                            const u0 = tu * 0.0625;
                            const v0 = 1.0 - (tv + 1) * 0.0625;
                            const u1 = u0 + 0.0625;
                            const v1 = v0 + 0.0625;

                            face.verts.forEach((v) => {
                                positions.push(wx + v[0], y + v[1], wz + v[2]);
                            });
                            uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
                            indices.push(
                                indexOffset, indexOffset + 1, indexOffset + 2,
                                indexOffset, indexOffset + 2, indexOffset + 3
                            );
                            indexOffset += 4;
                        }
                    });
                }
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        chunk.mesh = new THREE.Mesh(geometry, materials);
        chunk.mesh.receiveShadow = true;
        chunk.mesh.castShadow = true;
        scene.add(chunk.mesh);
        chunk.isDirty = false;
    }
}
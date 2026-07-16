// ==========================================
// ФАЙЛ: world.js
// Хранение вокселей, генерация ландшафта и деревень на основе Seed
// (Оптимизированная версия с высокой производительностью и расширенными деревнями)
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
    CRAFTING_TABLE: 14, 
    CHEST: 20,
    COAL_ORE: 21,
    IRON_ORE: 22,
    GOLD_ORE: 23,
    DIAMOND_ORE: 24,
    
    STICK: 30,
    WOODEN_SWORD: 31, WOODEN_SHOVEL: 32, WOODEN_PICKAXE: 33, WOODEN_AXE: 34, WOODEN_HOE: 35,
    STONE_SWORD: 36, STONE_SHOVEL: 37, STONE_PICKAXE: 38, STONE_AXE: 39, STONE_HOE: 40
};

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
        this.chunkMods = new Map();
        this.villageCache = new Map();
        
        this.chunkGenQueue = [];
        this.chunkMeshQueue = [];
        this.queuedForGen = new Set();
        this.queuedForMesh = new Set();
        
        this.loadModifiedBlocks();
    }

    getChunkKey(cx, cz) { return `${cx},${cz}`; }

    getBlockWorld(x, y, z) {
        if (y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
        const fx = Math.floor(x);
        const fy = Math.floor(y);
        const fz = Math.floor(z);
        
        const modKey = `${fx},${fy},${fz}`;
        if (this.modifiedBlocks.has(modKey)) return this.modifiedBlocks.get(modKey);

        const cx = Math.floor(fx / CHUNK_SIZE);
        const cz = Math.floor(fz / CHUNK_SIZE);
        const key = this.getChunkKey(cx, cz);
        const chunk = this.chunks[key];
        if (!chunk) return BLOCK.AIR;

        const bx = ((fx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const bz = ((fz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        return chunk.getBlock(bx, fy, bz);
    }

    addChunkMod(fx, fy, fz, val) {
        const cx = Math.floor(fx / CHUNK_SIZE);
        const cz = Math.floor(fz / CHUNK_SIZE);
        const bx = ((fx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const bz = ((fz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const key = this.getChunkKey(cx, cz);
        
        if (!this.chunkMods.has(key)) {
            this.chunkMods.set(key, []);
        }
        const list = this.chunkMods.get(key);
        for (let i = 0; i < list.length; i++) {
            if (list[i].bx === bx && list[i].y === fy && list[i].bz === bz) {
                list[i].val = val;
                return;
            }
        }
        list.push({ bx, y: fy, bz, val });
    }

    setBlockWorld(x, y, z, val) {
        if (y < 0 || y >= CHUNK_HEIGHT) return;
        const fx = Math.floor(x);
        const fy = Math.floor(y);
        const fz = Math.floor(z);
        
        const modKey = `${fx},${fy},${fz}`;
        this.modifiedBlocks.set(modKey, val);
        this.addChunkMod(fx, fy, fz, val);
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
        this.chunkMods = new Map();
        try {
            const saved = localStorage.getItem(`jscraft_mods_${this.seed}`);
            if (saved) {
                const data = JSON.parse(saved);
                this.modifiedBlocks = new Map(data);
                for (let [keyStr, val] of this.modifiedBlocks.entries()) {
                    const parts = keyStr.split(',');
                    const fx = parseInt(parts[0], 10);
                    const fy = parseInt(parts[1], 10);
                    const fz = parseInt(parts[2], 10);
                    this.addChunkMod(fx, fy, fz, val);
                }
            }
        } catch (e) {
            this.modifiedBlocks = new Map();
            this.chunkMods = new Map();
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

        const nearbyVillages = [];
        const regionX = Math.floor(cx / 8);
        const regionZ = Math.floor(cz / 8);
        for (let rx = regionX - 1; rx <= regionX + 1; rx++) {
            for (let rz = regionZ - 1; rz <= regionZ + 1; rz++) {
                const v = this.getVillageInRegion(rx, rz);
                if (v) nearbyVillages.push(v);
            }
        }

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const wx = cx * CHUNK_SIZE + x;
                const wz = cz * CHUNK_SIZE + z;

                const biomeNoise = smoothNoise(wx * 0.005, wz * 0.005, this.seed + 1000);
                let biomeType = 'plains';
                if (biomeNoise > 0.7) biomeType = 'forest';
                else if (biomeNoise > 0.5) biomeType = 'sparse_forest';
                else if (biomeNoise > 0.35) biomeType = 'hills';

                const e1 = smoothNoise(wx * 0.01, wz * 0.01, this.seed);
                const e2 = smoothNoise(wx * 0.03, wz * 0.03, this.seed + 100);
                const e3 = smoothNoise(wx * 0.08, wz * 0.08, this.seed + 200);
                
                let height = Math.floor(58 + e1 * 28 + e2 * 12 + e3 * 5);
                
                const riverNoise = smoothNoise(wx * 0.015, wz * 0.015, this.seed + 500);
                if (riverNoise < 0.22 && riverNoise > 0.18) height -= 6; 

                let surfaceBlock = BLOCK.GRASS;
                let subBlock = BLOCK.DIRT;
                if (biomeType === 'hills' && e3 > 0.4) {
                    surfaceBlock = BLOCK.STONE;
                    subBlock = BLOCK.STONE;
                }

                let terrainY = 0;

                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    if (y === 0) chunk.setBlock(x, y, z, BLOCK.BEDROCK);
                    else if (y < height - 4) chunk.setBlock(x, y, z, BLOCK.STONE);
                    else if (y < height) chunk.setBlock(x, y, z, subBlock);
                    else if (y === height) {
                        if (height <= 60) chunk.setBlock(x, y, z, BLOCK.SAND);
                        else {
                            chunk.setBlock(x, y, z, surfaceBlock);
                            terrainY = height;
                        }
                    }
                    else if (y <= 60 && y > height) chunk.setBlock(x, y, z, BLOCK.WATER);
                    else chunk.setBlock(x, y, z, BLOCK.AIR);
                }

                if (terrainY > 0 && surfaceBlock === BLOCK.GRASS) {
                    const meadowNoise = smoothNoise(wx * 0.015, wz * 0.015, this.seed + 3000); 
                    const patchNoise = smoothNoise(wx * 0.1, wz * 0.1, this.seed + 3001);     
                    const flowerRNG = hash2D(wx, wz, this.seed + 4000);
                    
                    let flowerChance = 0;
                    if (meadowNoise > 0.72) {
                        flowerChance = 0.15; 
                    } else if (patchNoise > 0.75) {
                        flowerChance = 0.08; 
                    } else {
                        flowerChance = 0.001; 
                    }

                    if (flowerRNG < flowerChance) {
                        chunk.setBlock(x, terrainY + 1, z, BLOCK.FLOWER);
                    }

                    const forestDensityNoise = smoothNoise(wx * 0.03, wz * 0.03, this.seed + 2000);
                    let treeChance = 0;
                    
                    if (biomeType === 'hills') {
                        treeChance = forestDensityNoise > 0.6 ? 0.01 : 0.001;
                    } else if (biomeType === 'sparse_forest') {
                        treeChance = forestDensityNoise > 0.5 ? 0.03 : 0.002;
                    } else if (biomeType === 'forest') {
                        if (forestDensityNoise > 0.65) treeChance = 0.15;
                        else if (forestDensityNoise > 0.4) treeChance = 0.06;
                        else treeChance = 0.005; 
                    } else { 
                        treeChance = forestDensityNoise > 0.8 ? 0.002 : 0.0001; 
                    }

                    const treeHash = hash2D(wx, wz, this.seed + 777);

                    if (treeHash < treeChance) {
                        const radius = 2; 
                        
                        let spaced = true;
                        for (let dx = -radius; dx <= radius; dx++) {
                            for (let dz = -radius; dz <= radius; dz++) {
                                if (dx === 0 && dz === 0) continue;
                                if (hash2D(wx + dx, wz + dz, this.seed + 777) < treeHash) {
                                    spaced = false;
                                    break;
                                }
                            }
                            if (!spaced) break;
                        }

                        let inVillage = false;
                        if (spaced) {
                            for (let i = 0; i < nearbyVillages.length; i++) {
                                const v = nearbyVillages[i];
                                const distSq = (wx - v.worldX)**2 + (wz - v.worldZ)**2;
                                if (distSq < 600) { 
                                    inVillage = true;
                                    break;
                                }
                            }
                        }

                        if (spaced && !inVillage) {
                            const isMega = (biomeType === 'forest' && hash2D(wx, wz, this.seed + 999) < 0.0125); 
                            this.buildTree(chunk, x, terrainY + 1, z, treeHash, isMega);
                        }
                    }
                }
            }
        }

        this.generateOreVeins(chunk, cx, cz, this.seed);
        this.generateVillageElementsForChunk(chunk, cx, cz);

        const chunkKey = this.getChunkKey(cx, cz);
        const mods = this.chunkMods.get(chunkKey);
        if (mods) {
            for (let i = 0; i < mods.length; i++) {
                const m = mods[i];
                chunk.setBlock(m.bx, m.y, m.bz, m.val);
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

    safeSetTrunk(chunk, nx, ny, nz) {
        if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny >= 0 && ny < CHUNK_HEIGHT) {
            chunk.setBlock(nx, ny, nz, BLOCK.WOOD);
        }
    }

    safeSetLeaf(chunk, nx, ny, nz) {
        if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny >= 0 && ny < CHUNK_HEIGHT) {
            if (chunk.getBlock(nx, ny, nz) === BLOCK.AIR) {
                chunk.setBlock(nx, ny, nz, BLOCK.LEAVES);
            }
        }
    }

    buildTree(chunk, tx, ty, tz, randomHash, isMega) {
        if (isMega) {
            this.buildMegaTree(chunk, tx, ty, tz, randomHash);
        } else {
            this.buildNormalTree(chunk, tx, ty, tz, randomHash);
        }
    }

    buildMegaTree(chunk, tx, ty, tz, randomHash) {
        const height = 12 + Math.floor(randomHash * 100) % 6; 
        
        for (let h = 0; h < height; h++) {
            this.safeSetTrunk(chunk, tx, ty + h, tz);
            this.safeSetTrunk(chunk, tx + 1, ty + h, tz);
            this.safeSetTrunk(chunk, tx, ty + h, tz + 1);
            this.safeSetTrunk(chunk, tx + 1, ty + h, tz + 1);
        }
        
        if (randomHash > 0.5 && height > 14) {
            this.safeSetTrunk(chunk, tx - 1, ty + height - 5, tz);
            this.safeSetLeaf(chunk, tx - 2, ty + height - 5, tz);
        }
        
        const leafBottom = ty + height - 7;
        const leafTop = ty + height + 2;
        for (let ny = leafBottom; ny <= leafTop; ny++) {
            let r = 3;
            if (ny === leafBottom || ny === leafTop) r = 1;
            else if (ny === leafBottom + 1 || ny === leafTop - 1) r = 2;
            else if (ny === ty + height - 3) r = 4;

            for (let dx = -r; dx <= r + 1; dx++) {
                for (let dz = -r; dz <= r + 1; dz++) {
                    let centerX = dx < 1 ? dx : dx - 1;
                    let centerZ = dz < 1 ? dz : dz - 1;
                    if (Math.abs(centerX) + Math.abs(centerZ) > r + 1) continue;
                    
                    this.safeSetLeaf(chunk, tx + dx, ny, tz + dz);
                }
            }
        }
    }

    buildNormalTree(chunk, tx, ty, tz, randomHash) {
        const typeVal = (randomHash * 10000) % 100;
        let height = 4;
        let type = 'medium';

        if (typeVal < 30) {
            type = 'small';
            height = 3 + Math.floor(randomHash * 100) % 2; 
        } else if (typeVal < 70) {
            type = 'medium';
            height = 4 + Math.floor(randomHash * 100) % 3; 
        } else {
            type = 'large';
            height = 6 + Math.floor(randomHash * 100) % 3; 
        }

        for (let h = 0; h < height; h++) {
            this.safeSetTrunk(chunk, tx, ty + h, tz);
        }

        let leafBottom, leafTop;
        if (type === 'small') {
            leafBottom = ty + height - 2;
            leafTop = ty + height + 1;
            for (let ny = leafBottom; ny <= leafTop; ny++) {
                const r = 1;
                for (let dx = -r; dx <= r; dx++) {
                    for (let dz = -r; dz <= r; dz++) {
                        if (Math.abs(dx) === r && Math.abs(dz) === r && ny === leafTop) continue;
                        this.safeSetLeaf(chunk, tx + dx, ny, tz + dz);
                    }
                }
            }
        } else if (type === 'medium') {
            leafBottom = ty + height - 3;
            leafTop = ty + height + 1;
            for (let ny = leafBottom; ny <= leafTop; ny++) {
                const r = (ny >= ty + height) ? 1 : 2;
                for (let dx = -r; dx <= r; dx++) {
                    for (let dz = -r; dz <= r; dz++) {
                        if (Math.abs(dx) === r && Math.abs(dz) === r && (ny === leafBottom || ny === leafTop)) continue;
                        this.safeSetLeaf(chunk, tx + dx, ny, tz + dz);
                    }
                }
            }
        } else if (type === 'large') {
            leafBottom = ty + height - 4;
            leafTop = ty + height + 2;
            for (let ny = leafBottom; ny <= leafTop; ny++) {
                let r = 2;
                if (ny === leafBottom || ny === leafTop) r = 1;
                if (ny === ty + height - 1) r = 3; 
                for (let dx = -r; dx <= r; dx++) {
                    for (let dz = -r; dz <= r; dz++) {
                        if (Math.abs(dx) === r && Math.abs(dz) === r && r > 1) continue;
                        this.safeSetLeaf(chunk, tx + dx, ny, tz + dz);
                    }
                }
            }
        }
    }

    getVillageInRegion(regionX, regionZ) {
        const cacheKey = `${regionX},${regionZ}`;
        if (this.villageCache.has(cacheKey)) return this.villageCache.get(cacheKey);

        const regSeed = Math.imul(regionX, 1597334677) ^ Math.imul(regionZ, 3812015801) ^ this.seed;
        const prng = new SeededPRNG(regSeed);
        if (prng.next() > 0.60) {
            this.villageCache.set(cacheKey, null);
            return null;
        }

        const village = {
            cx: regionX * 8 + Math.floor(prng.next() * 6) + 1,
            cz: regionZ * 8 + Math.floor(prng.next() * 6) + 1,
            worldX: (regionX * 8 + Math.floor(prng.next() * 6) + 1) * CHUNK_SIZE + 8,
            worldZ: (regionZ * 8 + Math.floor(prng.next() * 6) + 1) * CHUNK_SIZE + 8,
            houseCount: Math.floor(prng.next() * 4) + 4,
            hasFarm: prng.next() < 0.8,
            roadLength: Math.floor(prng.next() * 15) + 30,
            villagerCount: Math.floor(prng.next() * 5) + 4,
            prngSeed: regSeed
        };
        this.villageCache.set(cacheKey, village);
        return village;
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

        // 1. Главная крестообразная дорожная сеть
        const halfRoad = Math.floor(village.roadLength / 2);
        for (let dx = -halfRoad; dx <= halfRoad; dx++) {
            for (let dz = -1; dz <= 1; dz++) this.placeRoadBlock(chunk, centerWx + dx, floorY, centerWz + dz);
        }
        for (let dz = -halfRoad; dz <= halfRoad; dz++) {
            for (let dx = -1; dx <= 1; dx++) this.placeRoadBlock(chunk, centerWx + dx, floorY, centerWz + dz);
        }

        // 2. Распределение участков под гарантированные постройки
        const buildings = [];
        
        // Церковь (северный конец улицы)
        buildings.push({
            type: 'church',
            x: centerWx - 3,
            z: centerWz - halfRoad + 2,
            doorX: centerWx,
            doorZ: centerWz - halfRoad + 2
        });

        // Кузница (восточный сектор)
        buildings.push({
            type: 'blacksmith',
            x: centerWx + halfRoad - 10,
            z: centerWz + 4,
            doorX: centerWx + halfRoad - 7,
            doorZ: centerWz + 6
        });

        // Разнообразные жилые дома
        const houseOffsets = [
            [-14, -14], [14, -14], [-14, 14], [14, 14],
            [-22, -8], [22, 8], [-8, 22], [8, -22]
        ];
        
        for (let i = 0; i < village.houseCount && i < houseOffsets.length; i++) {
            const hx = centerWx + houseOffsets[i][0] + Math.floor(prng.next() * 4 - 2);
            const hz = centerWz + houseOffsets[i][1] + Math.floor(prng.next() * 4 - 2);
            buildings.push({
                type: 'house',
                x: hx,
                z: hz,
                doorX: hx + 3,
                doorZ: hz
            });
        }

        if (village.hasFarm) {
            buildings.push({
                type: 'farm',
                x: centerWx - 18,
                z: centerWz + 4,
                doorX: centerWx - 12,
                doorZ: centerWz + 7
            });
        }

        // 3. Соединение дорог и генерация архитектуры
        for (let i = 0; i < buildings.length; i++) {
            const b = buildings[i];
            
            this.connectRoad(chunk, centerWx, centerWz, b.doorX, floorY, b.doorZ);

            if (b.type === 'church') {
                this.generateChurchInChunk(chunk, b.x, floorY, b.z, prng);
            } else if (b.type === 'blacksmith') {
                this.generateBlacksmithInChunk(chunk, b.x, floorY, b.z, prng);
            } else if (b.type === 'house') {
                this.generateHouseInChunk(chunk, b.x, floorY, b.z, prng);
            } else if (b.type === 'farm') {
                this.generateFarmInChunk(chunk, b.x, floorY, b.z);
            }
        }
    }

    placeRoadBlock(chunk, wx, wy, wz) {
        if (Math.floor(wx / CHUNK_SIZE) !== chunk.cx || Math.floor(wz / CHUNK_SIZE) !== chunk.cz) return;
        const bx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const bz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        
        for (let y = wy; y < CHUNK_HEIGHT; y++) chunk.setBlock(bx, y, bz, BLOCK.AIR);
        chunk.setBlock(bx, wy - 1, bz, BLOCK.COBBLESTONE);
    }

    connectRoad(chunk, centerWx, centerWz, doorX, wy, doorZ) {
        const dx = doorX - centerWx;
        const dz = doorZ - centerWz;

        if (Math.abs(dx) < Math.abs(dz)) {
            const step = dx > 0 ? -1 : 1;
            for (let x = doorX; x !== centerWx; x += step) {
                for (let zOff = -1; zOff <= 1; zOff++) {
                    this.placeRoadBlock(chunk, x, wy, doorZ + zOff);
                }
            }
        } else {
            const step = dz > 0 ? -1 : 1;
            for (let z = doorZ; z !== centerWz; z += step) {
                for (let xOff = -1; xOff <= 1; xOff++) {
                    this.placeRoadBlock(chunk, doorX + xOff, wy, z);
                }
            }
        }
    }

    placeVillageBlock(chunk, wx, wy, wz, blockId) {
        if (wy < 0 || wy >= CHUNK_HEIGHT) return;
        if (Math.floor(wx / CHUNK_SIZE) === chunk.cx && Math.floor(wz / CHUNK_SIZE) === chunk.cz) {
            const bx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const bz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            chunk.setBlock(bx, wy, bz, blockId);
        }
    }

    // ==========================================
    // ГЕНЕРАТОРЫ НОВЫХ ЗДАНИЙ ДЕРЕВНИ
    // ==========================================

    generateChurchInChunk(chunk, hx, hy, hz, prng) {
        const w = 7, d = 11, h = 6, th = 12;
        for (let x = hx; x < hx + w; x++) {
            for (let z = hz; z < hz + d; z++) {
                if (Math.floor(x / CHUNK_SIZE) !== chunk.cx || Math.floor(z / CHUNK_SIZE) !== chunk.cz) continue;
                
                // Очистка воздуха над церковью
                for (let y = hy + 1; y < hy + th + 3; y++) {
                    this.placeVillageBlock(chunk, x, y, z, BLOCK.AIR);
                }
                
                // Пол
                this.placeVillageBlock(chunk, x, hy - 1, z, BLOCK.COBBLESTONE);

                const isTower = (z <= hz + 3 && x >= hx + 1 && x <= hx + w - 2);
                
                if (isTower) {
                    for (let y = hy; y < hy + th; y++) {
                        const isCorner = (x === hx + 1 || x === hx + w - 2) && (z === hz || z === hz + 3);
                        const isWall = (x === hx + 1 || x === hx + w - 2 || z === hz || z === hz + 3);
                        
                        if (isCorner) {
                            this.placeVillageBlock(chunk, x, y, z, BLOCK.WOOD);
                        } else if (isWall) {
                            const isWin = (y >= hy + 5 && y <= hy + 7) || (y >= hy + 9 && y <= hy + 10);
                            if (isWin && (x === hx + 3 || z === hz)) {
                                this.placeVillageBlock(chunk, x, y, z, BLOCK.GLASS);
                            } else {
                                this.placeVillageBlock(chunk, x, y, z, y < hy + 4 ? BLOCK.COBBLESTONE : BLOCK.STONE);
                            }
                        }
                    }
                    // Крыша и шпиль колокольни
                    if (x >= hx + 1 && x <= hx + w - 2 && z >= hz && z <= hz + 3) {
                        this.placeVillageBlock(chunk, x, hy + th, z, BLOCK.COBBLESTONE);
                    }
                    if (x === hx + 3 && z === hz + 1) {
                        this.placeVillageBlock(chunk, x, hy + th + 1, z, BLOCK.COBBLESTONE);
                        this.placeVillageBlock(chunk, x, hy + th + 2, z, BLOCK.WOOD);
                        this.placeVillageBlock(chunk, x, hy + th + 3, z, BLOCK.COBBLESTONE); // Крест
                    }
                } else {
                    // Неф церкви
                    for (let y = hy; y < hy + h; y++) {
                        const isCorner = (x === hx || x === hx + w - 1) && (z === hz + 4 || z === hz + d - 1);
                        const isWall = (x === hx || x === hx + w - 1 || z === hz + d - 1);
                        
                        if (isCorner) {
                            this.placeVillageBlock(chunk, x, y, z, BLOCK.WOOD);
                        } else if (isWall) {
                            const isWin = (y >= hy + 2 && y <= hy + 4) && (z % 2 === 1) && (x === hx || x === hx + w - 1);
                            if (isWin) {
                                this.placeVillageBlock(chunk, x, y, z, BLOCK.GLASS);
                            } else {
                                this.placeVillageBlock(chunk, x, y, z, y < hy + 2 ? BLOCK.COBBLESTONE : BLOCK.PLANK);
                            }
                        }
                    }
                    // Высокая двускатная крыша нефа
                    if (x === hx || x === hx + w - 1) this.placeVillageBlock(chunk, x, hy + h, z, BLOCK.PLANK);
                    else if (x === hx + 1 || x === hx + w - 2) this.placeVillageBlock(chunk, x, hy + h + 1, z, BLOCK.PLANK);
                    else this.placeVillageBlock(chunk, x, hy + h + 2, z, BLOCK.PLANK);

                    // Интерьер: скамьи и алтарь
                    if ((z === hz + 6 || z === hz + 8) && (x === hx + 2 || x === hx + 4)) {
                        this.placeVillageBlock(chunk, x, hy, z, BLOCK.PLANK);
                    }
                    if (z === hz + d - 2 && x === hx + 3) {
                        this.placeVillageBlock(chunk, x, hy, z, BLOCK.COBBLESTONE);
                        this.placeVillageBlock(chunk, x, hy + 1, z, BLOCK.FLOWER);
                    }
                }
            }
        }
        // Входной проем
        this.placeVillageBlock(chunk, hx + 3, hy, hz, BLOCK.AIR);
        this.placeVillageBlock(chunk, hx + 3, hy + 1, hz, BLOCK.AIR);
    }

    generateBlacksmithInChunk(chunk, hx, hy, hz, prng) {
        const w = 7, d = 8, h = 5;
        for (let x = hx; x < hx + w; x++) {
            for (let z = hz; z < hz + d; z++) {
                if (Math.floor(x / CHUNK_SIZE) !== chunk.cx || Math.floor(z / CHUNK_SIZE) !== chunk.cz) continue;
                
                for (let y = hy + 1; y < hy + h + 2; y++) {
                    this.placeVillageBlock(chunk, x, y, z, BLOCK.AIR);
                }
                
                // Каменный фундамент
                this.placeVillageBlock(chunk, x, hy - 1, z, BLOCK.COBBLESTONE);
                this.placeVillageBlock(chunk, x, hy, z, BLOCK.COBBLESTONE);

                if (z <= hz + 2) {
                    // Навес кузницы
                    if ((z === hz) && (x === hx + 1 || x === hx + w - 2)) {
                        this.placeVillageBlock(chunk, x, hy + 1, z, BLOCK.WOOD);
                        this.placeVillageBlock(chunk, x, hy + 2, z, BLOCK.WOOD);
                    }
                    this.placeVillageBlock(chunk, x, hy + 3, z, BLOCK.PLANK);
                    
                    // Кузнечная печь и наковальня
                    if (x === hx + 2 && z === hz + 1) {
                        for(let py = hy + 1; py <= hy + h; py++) this.placeVillageBlock(chunk, x, py, z, BLOCK.COBBLESTONE);
                        this.placeVillageBlock(chunk, x, hy + 1, z, BLOCK.FLOWER); // Огненное ядро
                    }
                    if (x === hx + 4 && z === hz + 1) {
                        this.placeVillageBlock(chunk, x, hy + 1, z, BLOCK.STONE); // Наковальня
                    }
                } else {
                    // Закрытая часть кузницы
                    for (let y = hy + 1; y < hy + h - 1; y++) {
                        const isCorner = (x === hx || x === hx + w - 1) && (z === hz + 3 || z === hz + d - 1);
                        const isWall = (x === hx || x === hx + w - 1 || z === hz + 3 || z === hz + d - 1);
                        
                        if (isCorner) {
                            this.placeVillageBlock(chunk, x, y, z, BLOCK.WOOD);
                        } else if (isWall) {
                            const isWin = (y === hy + 2) && (x === hx || x === hx + w - 1) && (z === hz + 5);
                            this.placeVillageBlock(chunk, x, y, z, isWin ? BLOCK.GLASS : BLOCK.PLANK);
                        }
                    }
                    this.placeVillageBlock(chunk, x, hy + h - 1, z, BLOCK.COBBLESTONE); // Плоская каменная крыша

                    // Сундук с лутом и верстак внутри
                    if (x === hx + 5 && z === hz + d - 2) this.placeVillageBlock(chunk, x, hy + 1, z, BLOCK.CHEST);
                    if (x === hx + 4 && z === hz + d - 2) this.placeVillageBlock(chunk, x, hy + 1, z, BLOCK.CRAFTING_TABLE);
                }
            }
        }
        this.placeVillageBlock(chunk, hx + 3, hy + 1, hz + 3, BLOCK.AIR); // Дверь под навес
        this.placeVillageBlock(chunk, hx + 3, hy + 2, hz + 3, BLOCK.AIR);
    }

    generateHouseInChunk(chunk, hx, hy, hz, prng) {
        // Случайные архитектурные параметры
        const w = 5 + Math.floor(prng.next() * 3); // 5, 6, или 7
        const d = 5 + Math.floor(prng.next() * 4); // 5, 6, 7, или 8
        const h = 4 + Math.floor(prng.next() * 2); // 4 или 5
        const roofType = Math.floor(prng.next() * 3); // 0: плоская, 1: двускатная, 2: пирамидальная
        const hasPorch = prng.next() > 0.4;
        const matWall = prng.next() > 0.5 ? BLOCK.PLANK : BLOCK.COBBLESTONE;

        for (let x = hx - 1; x < hx + w + 1; x++) {
            for (let z = hz - 2; z < hz + d + 1; z++) {
                if (Math.floor(x / CHUNK_SIZE) !== chunk.cx || Math.floor(z / CHUNK_SIZE) !== chunk.cz) continue;
                
                for (let y = hy; y < hy + h + 3; y++) {
                    this.placeVillageBlock(chunk, x, y, z, BLOCK.AIR);
                }

                // Крыльцо перед входом
                if (hasPorch && z === hz - 1 && x >= hx + 1 && x <= hx + w - 2) {
                    this.placeVillageBlock(chunk, x, hy - 1, z, BLOCK.PLANK);
                    if (x === hx + 1 || x === hx + w - 2) {
                        this.placeVillageBlock(chunk, x, hy, z, BLOCK.WOOD);
                        this.placeVillageBlock(chunk, x, hy + 1, z, BLOCK.WOOD);
                    }
                    this.placeVillageBlock(chunk, x, hy + 2, z, BLOCK.PLANK);
                }

                // Основная коробка дома
                if (x >= hx && x < hx + w && z >= hz && z < hz + d) {
                    this.placeVillageBlock(chunk, x, hy - 1, z, BLOCK.COBBLESTONE); // Пол
                    
                    for (let y = hy; y < hy + h; y++) {
                        const isCorner = (x === hx || x === hx + w - 1) && (z === hz || z === hz + d - 1);
                        const isWall = (x === hx || x === hx + w - 1 || z === hz || z === hz + d - 1);
                        
                        if (isCorner) {
                            this.placeVillageBlock(chunk, x, y, z, BLOCK.WOOD);
                        } else if (isWall) {
                            const isWin = (y === hy + 1 || (y === hy + 2 && h > 4)) && ((x === hx + 2) || (z === hz + Math.floor(d/2)));
                            this.placeVillageBlock(chunk, x, y, z, isWin ? BLOCK.GLASS : matWall);
                        }
                    }

                    // Генерация крыш разного типа
                    if (roofType === 0) {
                        // Плоская с парапетом
                        this.placeVillageBlock(chunk, x, hy + h, z, BLOCK.PLANK);
                        if (x === hx || x === hx + w - 1 || z === hz || z === hz + d - 1) {
                            this.placeVillageBlock(chunk, x, hy + h + 1, z, BLOCK.WOOD);
                        }
                    } else if (roofType === 1) {
                        // Двускатная крыша по оси X
                        const midX = hx + Math.floor(w / 2);
                        const dist = Math.abs(x - midX);
                        this.placeVillageBlock(chunk, x, hy + h + (w - 1 - dist * 2) - 1, z, BLOCK.PLANK);
                    } else if (roofType === 2) {
                        // Пирамидальная ступенчатая крыша
                        const dist = Math.min(x - hx, (hx + w - 1) - x, z - hz, (hz + d - 1) - z);
                        this.placeVillageBlock(chunk, x, hy + h + dist, z, BLOCK.PLANK);
                    }
                }
            }
        }
        // Дверной проём
        const doorX = hx + Math.floor(w / 2);
        this.placeVillageBlock(chunk, doorX, hy, hz, BLOCK.AIR);
        this.placeVillageBlock(chunk, doorX, hy + 1, hz, BLOCK.AIR);
    }

    generateFarmInChunk(chunk, fx, fy, fz) {
        const w = 6, d = 6;
        for (let x = fx; x < fx + w; x++) {
            for (let z = fz; z < fz + d; z++) {
                if (Math.floor(x / CHUNK_SIZE) !== chunk.cx || Math.floor(z / CHUNK_SIZE) !== chunk.cz) continue;
                
                for (let y = fy; y < CHUNK_HEIGHT; y++) this.placeVillageBlock(chunk, x, y, z, BLOCK.AIR);
                if (x === fx || x === fx + w - 1 || z === fz || z === fz + d - 1) this.placeVillageBlock(chunk, x, fy - 1, z, BLOCK.WOOD);
                else if (x === fx + 2 && z === fz + 2) this.placeVillageBlock(chunk, x, fy - 1, z, BLOCK.WATER);
                else { this.placeVillageBlock(chunk, x, fy - 1, z, BLOCK.DIRT); this.placeVillageBlock(chunk, x, fy, z, BLOCK.GRASS); }
            }
        }
    }

    checkVillagerSpawns(game, cx, cz) {
        const key = `${cx},${cz}`;
        if (this.spawnedVillages.has(key)) return;
        this.spawnedVillages.add(key);

        const regionX = Math.floor(cx / 8);
        const regionZ = Math.floor(cz / 8);
        const village = this.getVillageInRegion(regionX, regionZ);

        if (village && village.cx === cx && village.cz === cz) {
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

    // ==========================================
    // ОПТИМИЗИРОВАННЫЙ ЦИКЛ ОБНОВЛЕНИЯ ЧАНКОВ (Time-Slicing)
    // ==========================================
    updateVisibleChunks(playerX, playerZ, scene, materials, game = window.gameInstance) {
        const pCx = Math.floor(playerX / CHUNK_SIZE);
        const pCz = Math.floor(playerZ / CHUNK_SIZE);
        const renderRadius = 4;
        const unloadRadius = 6; 

        for (let x = pCx - renderRadius; x <= pCx + renderRadius; x++) {
            for (let z = pCz - renderRadius; z <= pCz + renderRadius; z++) {
                const key = this.getChunkKey(x, z);
                let chunk = this.chunks[key];

                if (!chunk) {
                    if (x === pCx && z === pCz) {
                        chunk = this.generateChunk(x, z);
                        this.chunks[key] = chunk;
                        this.chunkMeshQueue.push(chunk);
                        this.queuedForMesh.add(key);
                        if (game) this.checkVillagerSpawns(game, x, z);
                    } else if (!this.queuedForGen.has(key)) {
                        this.chunkGenQueue.push({x, z});
                        this.queuedForGen.add(key);
                    }
                } else {
                    if (game) this.checkVillagerSpawns(game, x, z);
                    
                    if ((chunk.isDirty || !chunk.mesh) && !this.queuedForMesh.has(key)) {
                        this.chunkMeshQueue.push(chunk);
                        this.queuedForMesh.add(key);
                    }
                    
                    if (chunk.mesh && !scene.children.includes(chunk.mesh)) {
                        scene.add(chunk.mesh);
                    }
                }
            }
        }

        if (this.chunkGenQueue.length > 1) {
            this.chunkGenQueue.sort((a, b) => {
                const distA = (a.x - pCx)**2 + (a.z - pCz)**2;
                const distB = (b.x - pCx)**2 + (b.z - pCz)**2;
                return distB - distA;
            });
        }

        if (this.chunkMeshQueue.length > 1) {
            this.chunkMeshQueue.sort((a, b) => {
                const distA = (a.cx - pCx)**2 + (a.cz - pCz)**2;
                const distB = (b.cx - pCx)**2 + (b.cz - pCz)**2;
                return distB - distA;
            });
        }

        const startTime = performance.now();
        const MAX_TIME_MS = 6.0;

        while (this.chunkGenQueue.length > 0 && (performance.now() - startTime < MAX_TIME_MS)) {
            const target = this.chunkGenQueue.pop();
            const key = this.getChunkKey(target.x, target.z);
            this.queuedForGen.delete(key);
            
            if (!this.chunks[key]) {
                const chunk = this.generateChunk(target.x, target.z);
                this.chunks[key] = chunk;
                if (game) this.checkVillagerSpawns(game, target.x, target.z);
                if (!this.queuedForMesh.has(key)) {
                    this.chunkMeshQueue.push(chunk);
                    this.queuedForMesh.add(key);
                }
            }
        }

        while (this.chunkMeshQueue.length > 0 && (performance.now() - startTime < MAX_TIME_MS)) {
            const chunk = this.chunkMeshQueue.pop();
            const key = this.getChunkKey(chunk.cx, chunk.cz);
            this.queuedForMesh.delete(key);
            
            if (this.chunks[key]) {
                this.rebuildChunkGeometry(chunk, scene, materials);
            }
        }

        if (performance.now() - startTime < MAX_TIME_MS) {
            for (let key in this.chunks) {
                const chunk = this.chunks[key];
                if (Math.abs(chunk.cx - pCx) > unloadRadius || Math.abs(chunk.cz - pCz) > unloadRadius) {
                    if (chunk.mesh) {
                        scene.remove(chunk.mesh);
                        if (chunk.mesh.geometry) chunk.mesh.geometry.dispose();
                        chunk.mesh = null; 
                    }
                }
            }
        }
    }

    // ==========================================
    // ZERO-ALLOCATION ПОСТРОЕНИЕ СЕТКИ
    // ==========================================
    rebuildChunkGeometry(chunk, scene, materials) {
        if (chunk.mesh) {
            scene.remove(chunk.mesh);
            if (chunk.mesh.geometry) chunk.mesh.geometry.dispose();
        }

        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const uvs = [];
        const indices = [];
        let indexOffset = 0;

        const chunkLeft  = this.chunks[this.getChunkKey(chunk.cx - 1, chunk.cz)];
        const chunkRight = this.chunks[this.getChunkKey(chunk.cx + 1, chunk.cz)];
        const chunkBack  = this.chunks[this.getChunkKey(chunk.cx, chunk.cz - 1)];
        const chunkFront = this.chunks[this.getChunkKey(chunk.cx, chunk.cz + 1)];

        const getNeighborFast = (lx, ly, lz) => {
            if (ly < 0 || ly >= CHUNK_HEIGHT) return BLOCK.AIR;
            if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
                return chunk.blocks[lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE];
            }
            if (lx < 0) {
                return chunkLeft ? chunkLeft.blocks[(lx + CHUNK_SIZE) + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE] : BLOCK.AIR;
            }
            if (lx >= CHUNK_SIZE) {
                return chunkRight ? chunkRight.blocks[(lx - CHUNK_SIZE) + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE] : BLOCK.AIR;
            }
            if (lz < 0) {
                return chunkBack ? chunkBack.blocks[lx + (lz + CHUNK_SIZE) * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE] : BLOCK.AIR;
            }
            if (lz >= CHUNK_SIZE) {
                return chunkFront ? chunkFront.blocks[lx + (lz - CHUNK_SIZE) * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE] : BLOCK.AIR;
            }
            return BLOCK.AIR;
        };

        const faces = [
            { dir: [0, 0, 1], verts: [[0,0,1], [1,0,1], [1,1,1], [0,1,1]] },
            { dir: [0, 0, -1], verts: [[1,0,0], [0,0,0], [0,1,0], [1,1,0]] },
            { dir: [1, 0, 0], verts: [[1,0,1], [1,0,0], [1,1,0], [1,1,1]] },
            { dir: [-1, 0, 0], verts: [[0,0,0], [0,0,1], [0,1,1], [0,1,0]] },
            { dir: [0, 1, 0], verts: [[0,1,1], [1,1,1], [1,1,0], [0,1,0]] },
            { dir: [0, -1, 0], verts: [[0,0,0], [1,0,0], [1,0,1], [0,0,1]] }
        ];

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    const block = chunk.blocks[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
                    if (block === BLOCK.AIR) continue;

                    const wx = chunk.cx * CHUNK_SIZE + x;
                    const wz = chunk.cz * CHUNK_SIZE + z;

                    for (let f = 0; f < 6; f++) {
                        const face = faces[f];
                        const nx = x + face.dir[0];
                        const ny = y + face.dir[1];
                        const nz = z + face.dir[2];

                        const neighbor = getNeighborFast(nx, ny, nz);
                        if (neighbor === BLOCK.AIR || (neighbor === BLOCK.WATER && block !== BLOCK.WATER)) {
                            
                            let faceTileIndex = block - 1;
                            if (block === BLOCK.CRAFTING_TABLE) {
                                if (face.dir[1] === 1) faceTileIndex = 14; 
                                else if (face.dir[1] === -1) faceTileIndex = 5; 
                                else faceTileIndex = 13; 
                            } else if (block === BLOCK.CHEST) {
                                faceTileIndex = 19;
                            }

                            const tu = faceTileIndex % 16;
                            const tv = Math.floor(faceTileIndex / 16);
                            const u0 = tu * 0.0625;
                            const v0 = 1.0 - (tv + 1) * 0.0625;
                            const u1 = u0 + 0.0625;
                            const v1 = v0 + 0.0625;

                            for (let v = 0; v < 4; v++) {
                                const vert = face.verts[v];
                                positions.push(wx + vert[0], y + vert[1], wz + vert[2]);
                            }
                            uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
                            indices.push(
                                indexOffset, indexOffset + 1, indexOffset + 2,
                                indexOffset, indexOffset + 2, indexOffset + 3
                            );
                            indexOffset += 4;
                        }
                    }
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
// ==========================================
// ФАЙЛ: world.js
// Хранение вокселей, генерация ландшафта и деревень
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
    BEDROCK: 11,
    CHEST: 20
};

class Chunk {
    constructor(cx, cz) {
        this.cx = cx;
        this.cz = cz;
        this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
        this.mesh = null;
        this.isDirty = false;
    }

    getIndex(x, y, z) {
        return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
    }

    getBlock(x, y, z) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
            return BLOCK.AIR;
        }
        return this.blocks[this.getIndex(x, y, z)];
    }

    setBlock(x, y, z, val) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
            return;
        }
        this.blocks[this.getIndex(x, y, z)] = val;
        this.isDirty = true;
    }
}

class World {
    constructor() {
        this.chunks = {};
        this.spawnedVillages = new Set(); // Чтобы не спавнить жителей повторно в одной деревне
    }

    getChunkKey(cx, cz) {
        return `${cx},${cz}`;
    }

    getBlockWorld(x, y, z) {
        if (y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
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
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const key = this.getChunkKey(cx, cz);
        let chunk = this.chunks[key];
        if (!chunk) {
            chunk = this.generateChunk(cx, cz);
            this.chunks[key] = chunk;
        }

        const bx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const bz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        chunk.setBlock(bx, y, bz, val);
    }

    getSurfaceHeight(x, z) {
        // Метод поиска высоты земли сверху-вниз
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            const b = this.getBlockWorld(x, y, z);
            if (b !== BLOCK.AIR && b !== BLOCK.LEAVES) {
                return y;
            }
        }
        return 60; // Уровень океана по умолчанию
    }

    generateChunk(cx, cz) {
        const chunk = new Chunk(cx, cz);

        // Генерация высот на основе тригонометрического псевдо-шума (без внешних зависимостей)
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const wx = cx * CHUNK_SIZE + x;
                const wz = cz * CHUNK_SIZE + z;

                // Базовый рельеф
                const height = Math.floor(
                    64 + 
                    Math.sin(wx * 0.05) * 8 + 
                    Math.cos(wz * 0.05) * 8 +
                    Math.sin(wx * 0.15) * Math.cos(wz * 0.15) * 3
                );

                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    if (y === 0) {
                        chunk.setBlock(x, y, z, BLOCK.BEDROCK);
                    } else if (y < height - 4) {
                        chunk.setBlock(x, y, z, BLOCK.STONE);
                    } else if (y < height) {
                        chunk.setBlock(x, y, z, BLOCK.DIRT);
                    } else if (y === height) {
                        chunk.setBlock(x, y, z, BLOCK.GRASS);
                    } else {
                        chunk.setBlock(x, y, z, BLOCK.AIR);
                    }
                }
            }
        }

        // Процедурная посадка Деревьев
        for (let x = 2; x < CHUNK_SIZE - 2; x++) {
            for (let z = 2; z < CHUNK_SIZE - 2; z++) {
                const wx = cx * CHUNK_SIZE + x;
                const wz = cz * CHUNK_SIZE + z;

                // Сажаем дерево с вероятностью 1% на блоке травы
                if (Math.abs(Math.sin(wx * 123.45 + wz * 678.9)) < 0.015) {
                    const terrainY = Math.floor(
                        64 + 
                        Math.sin(wx * 0.05) * 8 + 
                        Math.cos(wz * 0.05) * 8 +
                        Math.sin(wx * 0.15) * Math.cos(wz * 0.15) * 3
                    );
                    
                    this.buildTree(chunk, x, terrainY + 1, z);
                }
            }
        }

        // Автоматическая генерация Деревни на координатах (cx=2, cz=2)
        if (cx === 2 && cz === 2) {
            this.buildVillageInChunk(chunk);
        }

        return chunk;
    }

    buildTree(chunk, tx, ty, tz) {
        // Ствол
        for (let h = 0; h < 5; h++) {
            chunk.setBlock(tx, ty + h, tz, BLOCK.WOOD);
        }
        // Листва
        const ly = ty + 4;
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                for (let dy = 0; dy <= 2; dy++) {
                    if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && Math.random() < 0.5) continue;
                    if (chunk.getBlock(tx + dx, ly + dy, tz + dz) === BLOCK.AIR) {
                        chunk.setBlock(tx + dx, ly + dy, tz + dz, BLOCK.LEAVES);
                    }
                }
            }
        }
    }

    // Полноценная архитектура генерации Деревни (Дома, Дороги, Сундуки)
    buildVillageInChunk(chunk) {
        // Находим высоту поверхности в центре деревни (x=8, z=8) для ровной посадки зданий
        let floorY = 66;
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            const b = chunk.getBlock(8, y, 8);
            if (b !== BLOCK.AIR && b !== BLOCK.LEAVES) {
                floorY = y;
                break;
            }
        }

        // 1. Создаём дорогу через чанк
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 7; z <= 9; z++) {
                // Заменяем верхний слой дороги на булыжник и очищаем всё над дорогой до неба
                for (let y = floorY; y < CHUNK_HEIGHT; y++) {
                    chunk.setBlock(x, y, z, BLOCK.AIR);
                }
                chunk.setBlock(x, floorY - 1, z, BLOCK.COBBLESTONE);
            }
        }

        // 2. Домик Жителя №1 (Планки, доски, стёкла)
        const h1x = 3;
        const h1z = 2;
        this.generateHouse(chunk, h1x, floorY, h1z);

        // 3. Домик Жителя №2
        const h2x = 10;
        const h2z = 11;
        this.generateHouse(chunk, h2x, floorY, h2z);
    }

    generateHouse(chunk, hx, hy, hz) {
        const w = 5;
        const h = 4;
        const d = 5;

        // Очистка воздуха над местом дома до самого неба (чтобы дом не был засыпан землёй)
        for (let x = hx; x < hx + w; x++) {
            for (let z = hz; z < hz + d; z++) {
                for (let y = hy + h; y < CHUNK_HEIGHT; y++) {
                    chunk.setBlock(x, y, z, BLOCK.AIR);
                }
            }
        }

        // Очистка и создание коробки дома
        for (let x = hx; x < hx + w; x++) {
            for (let z = hz; z < hz + d; z++) {
                for (let y = hy; y < hy + h; y++) {
                    const isEdgeX = (x === hx || x === hx + w - 1);
                    const isEdgeZ = (z === hz || z === hz + d - 1);
                    const isCeil = (y === hy + h - 1);

                    if (isEdgeX || isEdgeZ || isCeil) {
                        chunk.setBlock(x, y, z, BLOCK.PLANK);
                    } else {
                        chunk.setBlock(x, y, z, BLOCK.AIR);
                    }
                }
            }
        }

        // Дверной проём
        chunk.setBlock(hx + 2, hy, hz, BLOCK.AIR);
        chunk.setBlock(hx + 2, hy + 1, hz, BLOCK.AIR);

        // Окошки
        chunk.setBlock(hx, hy + 1, hz + 2, BLOCK.GLASS);
        chunk.setBlock(hx + w - 1, hy + 1, hz + 2, BLOCK.GLASS);

        // Сундук внутри дома
        chunk.setBlock(hx + 1, hy, hz + 3, BLOCK.COBBLESTONE); // Коробка сундука
    }

    // Метод проверяет наличие деревни и спавнит жителей внутри/рядом с домами
    checkVillagerSpawns(game, cx, cz) {
        if (cx === 2 && cz === 2) {
            const key = `${cx},${cz}`;
            if (this.spawnedVillages.has(key)) return;
            this.spawnedVillages.add(key);

            // Обязательный спавн минимум 3 жителей в деревне
            const worldX = cx * CHUNK_SIZE;
            const worldZ = cz * CHUNK_SIZE;

            const spawnPoints = [
                { x: worldX + 5, z: worldZ + 4 },
                { x: worldX + 12, z: worldZ + 13 },
                { x: worldX + 8, z: worldZ + 8 }
            ];

            spawnPoints.forEach((pt) => {
                const sy = this.getSurfaceHeight(pt.x, pt.z);
                const villager = new Villager(pt.x, sy + 1, pt.z, worldX + 8, worldZ + 8);
                game.mobManager.mobs.push(villager);
                game.scene.add(villager.mesh);
            });
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

                // Спавним жителей, если деревня сгенерирована
                if (game) {
                    this.checkVillagerSpawns(game, x, z);
                }

                if (chunk.isDirty || !chunk.mesh) {
                    this.rebuildChunkGeometry(chunk, scene, materials);
                }
            }
        }
    }

    rebuildChunkGeometry(chunk, scene, materials) {
        if (chunk.mesh) {
            scene.remove(chunk.mesh);
        }

        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const uvs = [];
        const indices = [];
        let indexOffset = 0;

        // Отрисовка жадной блочной сетки граней вокселей
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    const block = chunk.getBlock(x, y, z);
                    if (block === BLOCK.AIR) continue;

                    // Позиция блока в мировом пространстве
                    const wx = chunk.cx * CHUNK_SIZE + x;
                    const wz = chunk.cz * CHUNK_SIZE + z;

                    // Атлас текстур 16х16 блоков. Вычисляем смещение UV
                    const tileIndex = block - 1;
                    const tu = tileIndex % 16;
                    const tv = Math.floor(tileIndex / 16);
                    const u0 = tu * 0.0625;
                    const v0 = 1.0 - (tv + 1) * 0.0625;
                    const u1 = u0 + 0.0625;
                    const v1 = v0 + 0.0625;

                    // Направления сторон
                    const faces = [
                        { dir: [0, 0, 1], verts: [[0,0,1], [1,0,1], [1,1,1], [0,1,1]] }, // Назад
                        { dir: [0, 0, -1], verts: [[1,0,0], [0,0,0], [0,1,0], [1,1,0]] }, // Вперёд
                        { dir: [1, 0, 0], verts: [[1,0,1], [1,0,0], [1,1,0], [1,1,1]] }, // Право
                        { dir: [-1, 0, 0], verts: [[0,0,0], [0,0,1], [0,1,1], [0,1,0]] }, // Лево
                        { dir: [0, 1, 0], verts: [[0,1,1], [1,1,1], [1,1,0], [0,1,0]] }, // Верх
                        { dir: [0, -1, 0], verts: [[0,0,0], [1,0,0], [1,0,1], [0,0,1]] }  // Низ
                    ];

                    faces.forEach((face) => {
                        const nx = wx + face.dir[0];
                        const ny = y + face.dir[1];
                        const nz = wz + face.dir[2];

                        // Рисуем грань только если соседний блок прозрачен (AIR или WATER)
                        const neighbor = this.getBlockWorld(nx, ny, nz);
                        if (neighbor === BLOCK.AIR || (neighbor === BLOCK.WATER && block !== BLOCK.WATER)) {
                            face.verts.forEach((v) => {
                                positions.push(wx + v[0], y + v[1], wz + v[2]);
                            });

                            uvs.push(
                                u0, v0,
                                u1, v0,
                                u1, v1,
                                u0, v1
                            );

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
// ==========================================
// ФАЙЛ: game.js
// Ядро игры, цикл рендеринга и управление
// ==========================================

class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.world = null;
        this.player = null;
        this.ui = null;
        this.mobManager = null;

        // Ввод управления
        this.keys = {};
        this.mouse = { x: 0, y: 0 };
        this.sensitivity = 0.002;
        this.lastTime = performance.now();

        // Камера: углы без заваливания набок
        this.cameraYaw = 0;
        this.cameraPitch = 0;

        this.dayCycle = 0.1; // 0.1 - начало ясного дня
        this.skyColor = new THREE.Color(0x80a0ff);

        this.initThree();
        this.generateProceduralAtlas();
        this.initWorld();
        this.initInput();
        this.spawnPlayer();
        this.animate();
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x80a0ff, 0.03);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.rotation.order = 'YXZ'; // Исключает появление Roll при совмещении Yaw/Pitch

        this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Поиск или создание контейнера
        let container = document.getElementById('game-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'game-container';
            document.body.appendChild(container);
        }
        container.appendChild(this.renderer.domElement);

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(this.ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 512;
        this.sunLight.shadow.mapSize.height = 512;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 150;
        const d = 40;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.scene.add(this.sunLight);

        // Селектор рамки куба блока перед глазами
        const selectGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
        const edges = new THREE.EdgesGeometry(selectGeo);
        this.blockSelector = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
        this.scene.add(this.blockSelector);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    generateProceduralAtlas() {
        const atlasCanvas = document.createElement('canvas');
        atlasCanvas.width = 256;
        atlasCanvas.height = 256;
        const ctx = atlasCanvas.getContext('2d');

        const colors = {
            dirt: [130, 85, 45], grass: [90, 160, 50], stone: [120, 120, 120],
            wood: [100, 75, 45], leaves: [40, 110, 40], plank: [170, 140, 95],
            cobble: [100, 100, 100], glass: [220, 240, 255], sand: [215, 195, 140]
        };

        const drawTile = (idx, base) => {
            const tx = idx % 16;
            const ty = Math.floor(idx / 16);
            for (let x = 0; x < 16; x++) {
                for (let y = 0; y < 16; y++) {
                    const noise = (Math.random() - 0.5) * 35;
                    const r = Math.max(0, Math.min(255, base[0] + noise));
                    const g = Math.max(0, Math.min(255, base[1] + noise));
                    const b = Math.max(0, Math.min(255, base[2] + noise));
                    ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
                    ctx.fillRect(tx * 16 + x, ty * 16 + y, 1, 1);
                }
            }
        };

        drawTile(0, colors.grass);
        drawTile(1, colors.dirt);
        drawTile(2, colors.stone);
        drawTile(3, colors.wood);
        drawTile(4, colors.leaves);
        drawTile(5, colors.plank);
        drawTile(6, colors.cobble);
        drawTile(7, colors.glass);
        drawTile(8, colors.sand);

        const texture = new THREE.CanvasTexture(atlasCanvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        this.materials = new THREE.MeshLambertMaterial({
            map: texture,
            side: THREE.DoubleSide
        });
    }

    initWorld() {
        this.world = new World();
        this.ui = new UISystem();
        this.mobManager = new MobManager(this);
    }

    initInput() {
        document.body.addEventListener('click', () => {
            // Разрешено кликать только если игрок жив
            if (this.player && this.player.alive) {
                if (document.pointerLockElement !== document.body) {
                    document.body.requestPointerLock();
                    // ИСПРАВЛЕНИЕ ОШИБКИ №2: Принудительно скрываем стартовое окно/меню паузы
                    const pauseScreen = document.getElementById('pause-screen');
                    if (pauseScreen) pauseScreen.classList.add('hidden');
                }
            }
        });

        // ИСПРАВЛЕНИЕ ОШИБКИ №3: Восстановлена потерянная логика клавиш Escape и E
        document.addEventListener('keydown', (e) => { 
            this.keys[e.code] = true; 
            
            // Вызов меню паузы на Escape
            if (e.code === 'Escape') {
                document.exitPointerLock();
                const pauseScreen = document.getElementById('pause-screen');
                if (pauseScreen) pauseScreen.classList.remove('hidden');
            }
            
            // Открытие инвентаря на E
            if (e.code === 'KeyE') {
                const overlay = document.getElementById('ui-overlay');
                if (overlay) {
                    overlay.classList.toggle('hidden');
                    if (!overlay.classList.contains('hidden')) {
                        document.exitPointerLock();
                        if (this.ui) this.ui.updateUI(); 
                    } else {
                        document.body.requestPointerLock();
                    }
                }
            }

            // Выбор слота в хотбаре по цифрам 1-9
            if (e.code.startsWith('Digit') && e.code.length === 6) {
                const digit = parseInt(e.code[5], 10);
                if (digit >= 1 && digit <= 9) {
                    if (this.player && this.player.inventory) {
                        this.player.inventory.selectedHotbarIndex = digit - 1;
                        this.player.inventory.updateUI();
                    }
                }
            }
        });
        
        document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

        document.addEventListener('wheel', (e) => {
            if (document.pointerLockElement === document.body && this.player && this.player.inventory) {
                if (e.deltaY > 0) {
                    this.player.inventory.selectedHotbarIndex = (this.player.inventory.selectedHotbarIndex + 1) % 9;
                } else {
                    this.player.inventory.selectedHotbarIndex = (this.player.inventory.selectedHotbarIndex + 8) % 9;
                }
                this.player.inventory.updateUI();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === document.body && this.player.alive) {
                this.cameraYaw -= e.movementX * this.sensitivity;
                this.cameraPitch -= e.movementY * this.sensitivity;

                // Ограничение камеры: строго от -89 до +89 градусов
                const limit = 89 * Math.PI / 180;
                this.cameraPitch = Math.max(-limit, Math.min(limit, this.cameraPitch));

                this.camera.rotation.set(this.cameraPitch, this.cameraYaw, 0);
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (document.pointerLockElement !== document.body || !this.player.alive) return;
            if (e.button === 0) this.breakBlock();
            if (e.button === 2) this.placeBlock();
        });
    }

    spawnPlayer() {
        // ИСПРАВЛЕНИЕ ОШИБКИ №1: Принудительно генерируем чанк под игроком ДО создания Entity.
        // Передаём 'this' в качестве экземпляра игры, чтобы спавн жителей в деревне мог сработать сразу при загрузке.
        this.world.updateVisibleChunks(0, 0, this.scene, this.materials, this);

        this.player = new Player(this.world);
        this.player.inventory = this.ui.slots ? this.ui : new InventorySystem();
        this.player.inventory.giveItem(BLOCK.GRASS, 64);
        this.player.inventory.giveItem(BLOCK.COBBLESTONE, 64);
    }

    playSound(type) {
        // Процедурный генератор аудиоэффектов
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'break') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(110, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.4, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.2);
            osc.start(); osc.stop(ctx.currentTime + 0.2);
        } else if (type === 'place') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(180, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc.start(); osc.stop(ctx.currentTime + 0.1);
        }
    }

    breakBlock() {
        const target = this.getRaycastIntersection();
        if (target) {
            const p = target.point.clone().sub(target.face.normal.clone().multiplyScalar(0.5));
            const bx = Math.floor(p.x);
            const by = Math.floor(p.y);
            const bz = Math.floor(p.z);

            const bType = this.world.getBlockWorld(bx, by, bz);
            if (bType !== BLOCK.AIR && bType !== BLOCK.BEDROCK) {
                // Если мы попали по мобу
                this.world.setBlockWorld(bx, by, bz, BLOCK.AIR);
                this.player.inventory.giveItem(bType, 1);
                this.playSound('break');
            }
        }

        // Альтернативный клик: атака по мобам через рейкаст
        this.checkAttackToMobs();
    }

    checkAttackToMobs() {
        const raycaster = new THREE.Raycaster();
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        raycaster.set(this.camera.position, dir);

        const meshes = this.mobManager.mobs.map(m => m.mesh).filter(mesh => mesh !== null);
        const hits = raycaster.intersectObjects(meshes, true);

        if (hits.length > 0 && hits[0].distance < 4.0) {
            // Ищем моба, у которого данный mesh
            const hitMesh = hits[0].object;
            let parent = hitMesh;
            while (parent && parent.parent !== this.scene) {
                parent = parent.parent;
            }

            const mob = this.mobManager.mobs.find(m => m.mesh === parent);
            if (mob) {
                // Отдача/толчок
                const knock = mob.position.clone().sub(this.player.position).normalize();
                knock.y = 0.5;
                mob.takeDamage(4, knock); // Сносит 2 сердечка за удар мечом
                this.playSound('break');
            }
        }
    }

    placeBlock() {
        const target = this.getRaycastIntersection();
        const held = this.player.inventory.getSelectedItem();
        if (target && held) {
            const p = target.point.clone().add(target.face.normal.clone().multiplyScalar(0.5));
            const bx = Math.floor(p.x);
            const by = Math.floor(p.y);
            const bz = Math.floor(p.z);

            const playerAABB = this.player.getAABB();
            const blockAABB = new AABB(
                new THREE.Vector3(bx, by, bz),
                new THREE.Vector3(bx + 1, by + 1, bz + 1)
            );

            if (!playerAABB.intersects(blockAABB)) {
                this.world.setBlockWorld(bx, by, bz, held.id);
                this.player.inventory.decreaseSelectedItem();
                this.playSound('place');
            }
        }
    }

    getRaycastIntersection() {
        const raycaster = new THREE.Raycaster();
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        raycaster.set(this.camera.position, direction);

        const chunkMeshes = [];
        for (let key in this.world.chunks) {
            if (this.world.chunks[key].mesh) {
                chunkMeshes.push(this.world.chunks[key].mesh);
            }
        }

        const hits = raycaster.intersectObjects(chunkMeshes);
        if (hits.length > 0 && hits[0].distance < 5.0) {
            return hits[0];
        }
        return null;
    }

    respawn() {
        // СБРОС СТАТУСА: инвентарь и мир НЕ стираются!
        this.player.health = this.player.maxHealth;
        this.player.hunger = this.player.maxHunger;
        this.player.alive = true;
        this.player.velocity.set(0, 0, 0);

        // ИСПРАВЛЕНИЕ ОШИБКИ №1: Аналогично spawnPlayer
        this.world.updateVisibleChunks(0, 0, this.scene, this.materials, this);
        const sy = this.world.getSurfaceHeight(0, 0);
        this.player.position.set(0, sy > 10 ? sy + 2 : 100, 0);

        // Очистим агрессивных мобов у спавна, чтобы не убили сразу
        this.mobManager.clearAllHostileMobs();

        // Закрываем окно смерти
        this.ui.hideDeathScreen();
        document.body.requestPointerLock();
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1); // Лимит лага кадров
        this.lastTime = now;

        if (this.player.alive) {
            // Логика управления Движением
            let forwardInput = 0;
            let sideInput = 0;

            if (this.keys['KeyW']) forwardInput += 1;
            if (this.keys['KeyS']) forwardInput -= 1;
            if (this.keys['KeyA']) sideInput -= 1;
            if (this.keys['KeyD']) sideInput += 1;

            const isJumping = this.keys['Space'];
            const isCrouching = this.keys['ShiftLeft'];
            const isSprinting = this.keys['ControlLeft'];

            // Вычисляем плоские векторы движения из YAW камеры
            const yaw = this.cameraYaw;
            const fx = -Math.sin(yaw);
            const fz = -Math.cos(yaw);
            const rx = Math.cos(yaw);
            const rz = -Math.sin(yaw);

            let dx = forwardInput * fx + sideInput * rx;
            let dz = forwardInput * fz + sideInput * rz;

            // Нормализация диагоналей
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0) {
                dx /= len;
                dz /= len;
            }

            this.player.tickPhysics(dx, dz, isJumping, isCrouching, isSprinting);
            
            // Камера жестко следует за головой
            this.camera.position.copy(this.player.position);
            this.camera.position.y += 1.6;
        } else {
            // Если игрок мёртв — плавно выходим из мыши и открываем экран
            if (document.pointerLockElement === document.body) {
                document.exitPointerLock();
            }
            this.ui.showDeathScreen();
        }

        // Вектор вращения камеры (Roll строго равен 0)
        this.camera.rotation.set(this.cameraPitch, this.cameraYaw, 0);
        this.camera.updateMatrixWorld();

        // Динамическое обновление чанков
        this.world.updateVisibleChunks(this.player.position.x, this.player.position.z, this.scene, this.materials, this);

        // Спавн и обновление ИИ
        this.mobManager.updateMobSpawning(this.player.position, this.world);
        this.mobManager.updateEntities(dt, this.player);
        this.mobManager.renderEntities(this.scene);

        // Обновление Селектора наведения
        const target = this.getRaycastIntersection();
        if (target && this.player.alive) {
            const p = target.point.clone().sub(target.face.normal.clone().multiplyScalar(0.5));
            this.blockSelector.position.set(Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5, Math.floor(p.z) + 0.5);
            this.blockSelector.visible = true;
        } else {
            this.blockSelector.visible = false;
        }

        // Смена времени суток (1 цикл = ~6 минут реального времени)
        this.dayCycle += 0.0001;
        if (this.dayCycle > 1.0) this.dayCycle = 0.0;

        const sunAngle = this.dayCycle * Math.PI * 2;
        this.sunLight.position.set(Math.cos(sunAngle) * 50, Math.sin(sunAngle) * 50, 15);

        const skyIntensity = Math.max(0.08, Math.sin(sunAngle));
        this.renderer.setClearColor(this.skyColor.clone().multiplyScalar(skyIntensity));
        this.scene.fog.color.copy(this.skyColor).multiplyScalar(skyIntensity);

        // HUD прогресс-бары
        const hpBar = document.getElementById('health-bar');
        if (hpBar) {
            hpBar.style.width = `${(this.player.health / this.player.maxHealth) * 100}%`;
        }
        const hgBar = document.getElementById('hunger-bar');
        if (hgBar) {
            hgBar.style.width = `${(this.player.hunger / this.player.maxHunger) * 100}%`;
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// Запуск игрового движка
window.onload = () => {
    window.gameInstance = new Game();
};
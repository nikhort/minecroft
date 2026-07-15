// ==========================================
// ФАЙЛ: game.js
// Ядро игры, цикл рендеринга и управление (с поддержкой Seed и сохранения мира)
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

        this.dayCycle = 0.1;
        this.skyColor = new THREE.Color(0x80a0ff);

        this.initThree();
        this.generateProceduralAtlas();
        this.initWorld();
        this.initInput();
        this.initMenuButtons();
        this.spawnPlayer();
        this.animate();
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x80a0ff, 0.03);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.rotation.order = 'YXZ';

        this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
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
        // Инициализация Seed: загрузка сохранённого или создание нового
        let currentSeed = localStorage.getItem('jscraft_current_seed');
        if (!currentSeed) {
            currentSeed = Math.floor(Math.random() * 2147483647);
            localStorage.setItem('jscraft_current_seed', currentSeed);
        } else {
            currentSeed = parseInt(currentSeed, 10);
        }

        this.world = new World(currentSeed);
        this.ui = new UISystem();
        this.mobManager = new MobManager(this);
    }

    initInput() {
        document.body.addEventListener('click', () => {
            if (this.player && this.player.alive) {
                if (document.pointerLockElement !== document.body) {
                    document.body.requestPointerLock();
                    const pauseScreen = document.getElementById('pause-screen');
                    if (pauseScreen) pauseScreen.classList.add('hidden');
                }
            }
        });

        document.addEventListener('keydown', (e) => { 
            this.keys[e.code] = true; 
            
            if (e.code === 'Escape') {
                document.exitPointerLock();
                const pauseScreen = document.getElementById('pause-screen');
                if (pauseScreen) pauseScreen.classList.remove('hidden');
            }
            
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
        });
        
        document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === document.body && this.player.alive) {
                this.cameraYaw -= e.movementX * this.sensitivity;
                this.cameraPitch -= e.movementY * this.sensitivity;

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

    initMenuButtons() {
        // Привязка кнопок меню паузы
        const btnResume = document.getElementById('btn-resume');
        if (btnResume) {
            btnResume.addEventListener('click', () => {
                const pauseScreen = document.getElementById('pause-screen');
                if (pauseScreen) pauseScreen.classList.add('hidden');
                document.body.requestPointerLock();
            });
        }

        const btnSave = document.getElementById('btn-save');
        if (btnSave) {
            btnSave.addEventListener('click', () => {
                this.world.saveModifiedBlocks();
                alert('Мир (Seed: ' + this.world.seed + ') успешно сохранён!');
            });
        }

        // Добавление кнопки "Создать новый мир", если её нет в HTML
        const menuBox = document.querySelector('#pause-screen .menu-box');
        if (menuBox && !document.getElementById('btn-new-world')) {
            const btnNew = document.createElement('button');
            btnNew.id = 'btn-new-world';
            btnNew.className = 'menu-btn';
            btnNew.innerText = 'Создать новый мир';
            btnNew.addEventListener('click', () => {
                if (confirm('Сгенерировать совершенно новый случайный мир? Текущие несохранённые изменения будут сброшены.')) {
                    // Генерируем новый Seed и перезапускаем мир
                    const newSeed = Math.floor(Math.random() * 2147483647);
                    localStorage.setItem('jscraft_current_seed', newSeed);
                    
                    // Очистка старой сцены от чанков и мобов
                    for (let key in this.world.chunks) {
                        if (this.world.chunks[key].mesh) {
                            this.scene.remove(this.world.chunks[key].mesh);
                        }
                    }
                    this.mobManager.mobs.forEach(m => { if (m.mesh) this.scene.remove(m.mesh); });
                    this.mobManager.mobs = [];
                    this.mobManager.drops.forEach(d => { if (d.mesh) this.scene.remove(d.mesh); });
                    this.mobManager.drops = [];

                    // Пересоздание мира с новым Seed
                    this.world = new World(newSeed);
                    this.spawnPlayer();

                    const pauseScreen = document.getElementById('pause-screen');
                    if (pauseScreen) pauseScreen.classList.add('hidden');
                    document.body.requestPointerLock();
                }
            });
            
            // Вставляем кнопку после кнопки сохранения
            if (btnSave && btnSave.nextSibling) {
                menuBox.insertBefore(btnNew, btnSave.nextSibling);
            } else {
                menuBox.appendChild(btnNew);
            }
        }
    }

    spawnPlayer() {
        this.world.updateVisibleChunks(0, 0, this.scene, this.materials);

        this.player = new Player(this.world);
        this.player.inventory = this.ui.slots ? this.ui : new InventorySystem();
        this.player.inventory.giveItem(BLOCK.GRASS, 64);
        this.player.inventory.giveItem(BLOCK.COBBLESTONE, 64);
    }

    playSound(type) {
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
                this.world.setBlockWorld(bx, by, bz, BLOCK.AIR);
                this.player.inventory.giveItem(bType, 1);
                this.playSound('break');
            }
        }

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
            const hitMesh = hits[0].object;
            let parent = hitMesh;
            while (parent && parent.parent !== this.scene) {
                parent = parent.parent;
            }

            const mob = this.mobManager.mobs.find(m => m.mesh === parent);
            if (mob) {
                const knock = mob.position.clone().sub(this.player.position).normalize();
                knock.y = 0.5;
                mob.takeDamage(4, knock);
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
        this.player.health = this.player.maxHealth;
        this.player.hunger = this.player.maxHunger;
        this.player.alive = true;
        this.player.velocity.set(0, 0, 0);

        this.world.updateVisibleChunks(0, 0, this.scene, this.materials);
        const sy = this.world.getSurfaceHeight(0, 0);
        this.player.position.set(0, sy > 10 ? sy + 2 : 100, 0);

        this.mobManager.clearAllHostileMobs();

        this.ui.hideDeathScreen();
        document.body.requestPointerLock();
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        if (this.player.alive) {
            let forwardInput = 0;
            let sideInput = 0;

            if (this.keys['KeyW']) forwardInput += 1;
            if (this.keys['KeyS']) forwardInput -= 1;
            if (this.keys['KeyA']) sideInput -= 1;
            if (this.keys['KeyD']) sideInput += 1;

            const isJumping = this.keys['Space'];
            const isCrouching = this.keys['ShiftLeft'];
            const isSprinting = this.keys['ControlLeft'];

            const yaw = this.cameraYaw;
            const fx = -Math.sin(yaw);
            const fz = -Math.cos(yaw);
            const rx = Math.cos(yaw);
            const rz = -Math.sin(yaw);

            let dx = forwardInput * fx + sideInput * rx;
            let dz = forwardInput * fz + sideInput * rz;

            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0) {
                dx /= len;
                dz /= len;
            }

            this.player.tickPhysics(dx, dz, isJumping, isCrouching, isSprinting);
            
            this.camera.position.copy(this.player.position);
            this.camera.position.y += 1.6;
        } else {
            if (document.pointerLockElement === document.body) {
                document.exitPointerLock();
            }
            this.ui.showDeathScreen();
        }

        this.camera.rotation.set(this.cameraPitch, this.cameraYaw, 0);
        this.camera.updateMatrixWorld();

        this.world.updateVisibleChunks(this.player.position.x, this.player.position.z, this.scene, this.materials);

        this.mobManager.updateMobSpawning(this.player.position, this.world);
        this.mobManager.updateEntities(dt, this.player);
        this.mobManager.renderEntities(this.scene);

        const target = this.getRaycastIntersection();
        if (target && this.player.alive) {
            const p = target.point.clone().sub(target.face.normal.clone().multiplyScalar(0.5));
            this.blockSelector.position.set(Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5, Math.floor(p.z) + 0.5);
            this.blockSelector.visible = true;
        } else {
            this.blockSelector.visible = false;
        }

        this.dayCycle += 0.0001;
        if (this.dayCycle > 1.0) this.dayCycle = 0.0;

        const sunAngle = this.dayCycle * Math.PI * 2;
        this.sunLight.position.set(Math.cos(sunAngle) * 50, Math.sin(sunAngle) * 50, 15);

        const skyIntensity = Math.max(0.08, Math.sin(sunAngle));
        this.renderer.setClearColor(this.skyColor.clone().multiplyScalar(skyIntensity));
        this.scene.fog.color.copy(this.skyColor).multiplyScalar(skyIntensity);

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

window.onload = () => {
    window.gameInstance = new Game();
};
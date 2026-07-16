// ==========================================
// ФАЙЛ: game.js
// Ядро игры, цикл рендеринга и управление
// ==========================================

const DAY_DURATION = 1200; // 20 минут в секундах
const NIGHT_DURATION = 600; // 10 минут в секундах

class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.world = null;
        this.player = null;
        this.ui = null;
        this.mobManager = null;

        this.keys = {};
        this.mouse = { x: 0, y: 0 };
        this.sensitivity = 0.002;
        this.lastTime = performance.now();

        this.cameraYaw = 0;
        this.cameraPitch = 0;

        this.dayCycle = 0.3;
        this.skyColor = new THREE.Color(0x80a0ff);

        this.isMining = false;
        this.miningProgress = 0;
        this.currentTargetPos = null;
        this.blockHardness = {
            [BLOCK.LEAVES]: 0.2, [BLOCK.FLOWER]: 0.1, [BLOCK.GRASS]: 0.3,
            [BLOCK.DIRT]: 0.5, [BLOCK.SAND]: 0.6, [BLOCK.GRAVEL]: 0.6,
            [BLOCK.PLANK]: 1.0, [BLOCK.WOOD]: 2.0, [BLOCK.STONE]: 4.0,
            [BLOCK.COBBLESTONE]: 4.0, [BLOCK.COAL_ORE]: 5.0, [BLOCK.IRON_ORE]: 6.0,
            [BLOCK.GOLD_ORE]: 6.5, [BLOCK.DIAMOND_ORE]: 7.0, [BLOCK.GLASS]: 0.3,
            [BLOCK.CRAFTING_TABLE]: 2.0, [BLOCK.CHEST]: 2.5, [BLOCK.BEDROCK]: Infinity
        };

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

        const crackTex = this.generateCrackTexture();
        this.crackMaterial = new THREE.MeshBasicMaterial({
            map: crackTex, transparent: true, depthWrite: false, 
            polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
        });
        const crackGeo = new THREE.BoxGeometry(1.008, 1.008, 1.008);
        this.crackMesh = new THREE.Mesh(crackGeo, this.crackMaterial);
        this.crackMesh.visible = false;
        this.scene.add(this.crackMesh);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    generateCrackTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 160; canvas.height = 16;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 160, 16);
        for (let stage = 1; stage < 10; stage++) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < stage * 4; i++) {
                const sx = stage * 16 + Math.random() * 16;
                const sy = Math.random() * 16;
                const ex = sx + (Math.random() - 0.5) * 8;
                const ey = sy + (Math.random() - 0.5) * 8;
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
            }
            ctx.stroke();
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.repeat.set(0.1, 1);
        return tex;
    }

    generateProceduralAtlas() {
        const atlasCanvas = document.createElement('canvas');
        atlasCanvas.width = 256; atlasCanvas.height = 256;
        const ctx = atlasCanvas.getContext('2d');
        ctx.clearRect(0, 0, 256, 256);

        const colors = {
            dirt: [130, 85, 45], grass: [90, 160, 50], stone: [120, 120, 120],
            wood: [100, 75, 45], leaves: [40, 110, 40], plank: [170, 140, 95],
            cobble: [100, 100, 100], sand: [215, 195, 140],
            water: [50, 100, 200], bedrock: [30, 30, 30], gravel: [130, 130, 130],
            flower: [255, 100, 150]
        };

        const drawTile = (idx, base) => {
            const tx = idx % 16; const ty = Math.floor(idx / 16);
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

        const drawOreTile = (idx, spotColor) => {
            drawTile(idx, colors.stone);
            const tx = idx % 16; const ty = Math.floor(idx / 16);
            for(let i = 0; i < 22; i++) {
                const ox = Math.floor(Math.random() * 16);
                const oy = Math.floor(Math.random() * 16);
                ctx.fillStyle = spotColor;
                ctx.fillRect(tx * 16 + ox, ty * 16 + oy, 1, 1);
            }
        };

        // Специальная отрисовка прозрачного стекла (тайл 7)
        const drawGlassTile = (idx) => {
            const tx = idx % 16; const ty = Math.floor(idx / 16);
            ctx.clearRect(tx * 16, ty * 16, 16, 16);
            for (let x = 0; x < 16; x++) {
                for (let y = 0; y < 16; y++) {
                    const isBorder = (x === 0 || x === 15 || y === 0 || y === 15);
                    const isStreak = (x === 3 && y > 2 && y < 13) || (x === 12 && y > 3 && y < 12);
                    if (isBorder) {
                        ctx.fillStyle = 'rgba(180, 220, 250, 0.95)';
                    } else if (isStreak) {
                        ctx.fillStyle = 'rgba(230, 245, 255, 0.7)';
                    } else {
                        ctx.fillStyle = 'rgba(200, 230, 255, 0.3)';
                    }
                    ctx.fillRect(tx * 16 + x, ty * 16 + y, 1, 1);
                }
            }
        };
        
        drawTile(0, colors.grass); drawTile(1, colors.dirt); drawTile(2, colors.stone);
        drawTile(3, colors.wood); drawTile(4, colors.leaves); drawTile(5, colors.plank);
        drawTile(6, colors.cobble); drawGlassTile(7); drawTile(8, colors.sand);
        drawTile(9, colors.water); drawTile(10, colors.bedrock); drawTile(11, colors.gravel);
        drawTile(12, colors.flower); drawTile(19, [150, 100, 50]);

        // Тайл сундука (20)
        drawTile(19, [140, 90, 40]);
        ctx.fillStyle = '#222222';
        ctx.fillRect((19%16)*16 + 6, Math.floor(19/16)*16 + 6, 4, 5);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect((19%16)*16 + 7, Math.floor(19/16)*16 + 7, 2, 3);

        ctx.fillStyle = '#3a2312';
        for(let i=0; i<16; i+=3) ctx.fillRect((3%16)*16 + i, Math.floor(3/16)*16, 1, 16);

        ctx.fillStyle = '#8b694a';
        for(let y=0; y<16; y+=4) ctx.fillRect((5%16)*16, Math.floor(5/16)*16 + y, 16, 1);
        ctx.fillRect((5%16)*16 + 4, Math.floor(5/16)*16 + 0, 1, 4);
        ctx.fillRect((5%16)*16 + 10, Math.floor(5/16)*16 + 4, 1, 4);
        ctx.fillRect((5%16)*16 + 6, Math.floor(5/16)*16 + 8, 1, 4);
        ctx.fillRect((5%16)*16 + 12, Math.floor(5/16)*16 + 12, 1, 4);

        drawTile(13, colors.plank); 
        ctx.fillStyle = '#8b694a';
        for(let y=0; y<16; y+=4) ctx.fillRect((13%16)*16, Math.floor(13/16)*16 + y, 16, 1);
        ctx.fillStyle = '#444'; ctx.fillRect((13%16)*16 + 3, Math.floor(13/16)*16 + 5, 4, 3);
        ctx.fillStyle = '#8B0000'; ctx.fillRect((13%16)*16 + 7, Math.floor(13/16)*16 + 5, 2, 2);

        drawTile(14, [150, 110, 70]); 
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect((14%16)*16 + 4, Math.floor(14/16)*16, 1, 16);
        ctx.fillRect((14%16)*16 + 10, Math.floor(14/16)*16, 1, 16);
        ctx.fillRect((14%16)*16, Math.floor(14/16)*16 + 4, 16, 1);
        ctx.fillRect((14%16)*16, Math.floor(14/16)*16 + 10, 16, 1);

        drawOreTile(20, 'rgb(30, 30, 30)'); drawOreTile(21, 'rgb(220, 170, 120)');
        drawOreTile(22, 'rgb(255, 215, 0)'); drawOreTile(23, 'rgb(0, 255, 255)');

        const drawSprite = (idx, sprite, colorMap) => {
            const tx = idx % 16;
            const ty = Math.floor(idx / 16);
            for(let y=0; y<16; y++) {
                for(let x=0; x<16; x++) {
                    const char = sprite[y][x];
                    if(char && char !== ' ' && colorMap[char]) {
                        ctx.fillStyle = colorMap[char];
                        ctx.fillRect(tx * 16 + x, ty * 16 + y, 1, 1);
                    }
                }
            }
        };

        const sprStick = [
            "                ", "                ", "             ## ", "            ##  ",
            "           ##   ", "          ##    ", "         ##     ", "        ##      ",
            "       ##       ", "      ##        ", "     ##         ", "    ##          ",
            "   ##           ", "  ##            ", "                ", "                "
        ];
        const sprSword = [
            "              O ", "             OOO", "            OOO ", "           OOO  ",
            "          OOO   ", "         OOO    ", "        OOO     ", "       OOO      ",
            "      OOO       ", "  #  OOO        ", " ###OO          ", "  ###           ",
            "   ##           ", "  ##            ", " ##             ", "                "
        ];
        const sprShovel = [
            "             OO ", "            OOOO", "            OOOO", "             OO ",
            "            ##  ", "           ##   ", "          ##    ", "         ##     ",
            "        ##      ", "       ##       ", "      ##        ", "     ##         ",
            "    ##          ", "   ##           ", "  ##            ", "                "
        ];
        const sprPickaxe = [
            "   OOOOOOOOOO   ", " OOOOOOOOOOOOO  ", " OOO      # OOO ", " OO      ##  OO ",
            " O      ##    O ", "       ##       ", "      ##        ", "     ##         ",
            "    ##          ", "   ##           ", "  ##            ", " ##             ",
            "##              ", "                ", "                ", "                "
        ];
        const sprAxe = [
            "       OOOO     ", "      OOOOOO    ", "      OOOOOO    ", "       ##OOO    ",
            "      ## OO     ", "     ##         ", "    ##          ", "   ##           ",
            "  ##            ", " ##             ", "##              ", "                ",
            "                ", "                ", "                ", "                "
        ];
        const sprHoe = [
            "      OOOOO     ", "     OOOOOOO    ", "     OO  ##     ", "     O   ##     ",
            "        ##      ", "       ##       ", "      ##        ", "     ##         ",
            "    ##          ", "   ##           ", "  ##            ", " ##             ",
            "##              ", "                ", "                ", "                "
        ];

        const colWood = { '#': '#5c3a21', 'O': '#a06535' }; 
        const colStone = { '#': '#5c3a21', 'O': '#888888' }; 

        drawSprite(29, sprStick, { '#': '#5c3a21' });  
        drawSprite(30, sprSword, colWood);    
        drawSprite(31, sprShovel, colWood);   
        drawSprite(32, sprPickaxe, colWood);  
        drawSprite(33, sprAxe, colWood);      
        drawSprite(34, sprHoe, colWood);      
        drawSprite(35, sprSword, colStone);   
        drawSprite(36, sprShovel, colStone);  
        drawSprite(37, sprPickaxe, colStone); 
        drawSprite(38, sprAxe, colStone);     
        drawSprite(39, sprHoe, colStone);     

        this.atlasCanvas = atlasCanvas;

        const texture = new THREE.CanvasTexture(atlasCanvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        // Включаем прозрачность для корректного отображения стекла
        this.materials = new THREE.MeshLambertMaterial({ 
            map: texture, 
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.05
        });
    }

    initWorld() {
        let currentSeed = localStorage.getItem('jscraft_current_seed');
        if (!currentSeed) {
            currentSeed = Math.floor(Math.random() * 2147483647);
            localStorage.setItem('jscraft_current_seed', currentSeed);
        } else currentSeed = parseInt(currentSeed, 10);

        this.world = new World(currentSeed);
        this.ui = new UISystem();
        this.mobManager = new MobManager(this);
    }

    initInput() {
        document.body.addEventListener('click', () => {
            if (this.player && this.player.alive && !this.ui.isOpen) {
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
                if (this.ui.isOpen) {
                    this.ui.closeUI();
                } else {
                    document.exitPointerLock();
                    const pauseScreen = document.getElementById('pause-screen');
                    if (pauseScreen) pauseScreen.classList.remove('hidden');
                }
            }
            
            if (e.code === 'KeyE') {
                if (this.ui.isOpen) {
                    this.ui.closeUI();
                } else {
                    this.keys = {}; 
                    document.exitPointerLock();
                    this.ui.openInventory();
                }
            }

            if (this.player && this.player.alive && !this.ui.isOpen && document.pointerLockElement === document.body) {
                if (e.code.startsWith('Digit')) {
                    const digit = parseInt(e.key);
                    if (digit >= 1 && digit <= 9) {
                        this.ui.selectedHotbarIndex = digit - 1;
                        this.ui.updateUI();
                    }
                }
            }
        });
        
        document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === document.body && this.player.alive && !this.ui.isOpen) {
                this.cameraYaw -= e.movementX * this.sensitivity;
                this.cameraPitch -= e.movementY * this.sensitivity;
                const limit = 89 * Math.PI / 180;
                this.cameraPitch = Math.max(-limit, Math.min(limit, this.cameraPitch));
                this.camera.rotation.set(this.cameraPitch, this.cameraYaw, 0);
            }
        });

        document.addEventListener('wheel', (e) => {
            if (!this.player || !this.player.alive || this.ui.isOpen || document.pointerLockElement !== document.body) return;

            if (e.deltaY > 0) {
                this.ui.selectedHotbarIndex = (this.ui.selectedHotbarIndex + 1) % 9;
            } else if (e.deltaY < 0) {
                this.ui.selectedHotbarIndex = (this.ui.selectedHotbarIndex - 1 + 9) % 9;
            }
            this.ui.updateUI();
        }, { passive: true });

        document.addEventListener('mousedown', (e) => {
            if (document.pointerLockElement !== document.body || !this.player.alive || this.ui.isOpen) return;
            
            if (e.button === 0) {
                this.isMining = true;
                this.checkAttackToMobs();
            }
            if (e.button === 2) {
                this.interactOrPlaceBlock();
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.isMining = false;
                this.miningProgress = 0;
            }
        });
    }

    interactOrPlaceBlock() {
        const target = this.getRaycastIntersection();
        if (target) {
            const p = target.point.clone().sub(target.face.normal.clone().multiplyScalar(0.5));
            const bx = Math.floor(p.x);
            const by = Math.floor(p.y);
            const bz = Math.floor(p.z);

            const bType = this.world.getBlockWorld(bx, by, bz);
            if (bType === BLOCK.CRAFTING_TABLE) {
                this.keys = {};
                document.exitPointerLock();
                this.ui.openWorkbench();
                return; 
            }
        }
        this.placeBlock();
    }

    initMenuButtons() {
        const btnResume = document.getElementById('btn-resume');
        if (btnResume) btnResume.addEventListener('click', () => {
            const pauseScreen = document.getElementById('pause-screen');
            if (pauseScreen) pauseScreen.classList.add('hidden');
            document.body.requestPointerLock();
        });

        const btnSave = document.getElementById('btn-save');
        if (btnSave) btnSave.addEventListener('click', () => {
            this.world.saveModifiedBlocks();
            alert('Мир сохранён!');
        });

        const menuBox = document.querySelector('#pause-screen .menu-box');
        if (menuBox && !document.getElementById('btn-new-world')) {
            const btnNew = document.createElement('button');
            btnNew.id = 'btn-new-world'; btnNew.className = 'menu-btn'; btnNew.innerText = 'Создать новый мир';
            btnNew.addEventListener('click', () => {
                if (confirm('Сгенерировать новый мир?')) {
                    localStorage.setItem('jscraft_current_seed', Math.floor(Math.random() * 2147483647));
                    location.reload();
                }
            });
            menuBox.appendChild(btnNew);
        }
    }

    spawnPlayer() {
        this.world.updateVisibleChunks(0, 0, this.scene, this.materials);
        this.player = new Player(this.world);
        this.player.inventory = this.ui;
        this.player.inventory.giveItem(BLOCK.WOOD, 64);
        this.player.inventory.giveItem(BLOCK.COBBLESTONE, 64);
        this.player.inventory.giveItem(BLOCK.GLASS, 64);
    }

    playSound(type) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        if (type === 'break') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(110, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.4, ctx.currentTime); gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.2);
            osc.start(); osc.stop(ctx.currentTime + 0.2);
        } else if (type === 'place') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(180, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc.start(); osc.stop(ctx.currentTime + 0.1);
        }
    }

    checkAttackToMobs() {
        const raycaster = new THREE.Raycaster();
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        raycaster.set(this.camera.position, dir);

        const meshes = this.mobManager.mobs.map(m => m.mesh).filter(mesh => mesh !== null);
        const hits = raycaster.intersectObjects(meshes, true);

        if (hits.length > 0 && hits[0].distance < 4.0) {
            let parent = hits[0].object;
            while (parent && parent.parent !== this.scene) parent = parent.parent;
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
        if (target && held && held.id < 30) {
            const p = target.point.clone().add(target.face.normal.clone().multiplyScalar(0.5));
            const bx = Math.floor(p.x); const by = Math.floor(p.y); const bz = Math.floor(p.z);

            const playerAABB = this.player.getAABB();
            const blockAABB = new AABB(new THREE.Vector3(bx, by, bz), new THREE.Vector3(bx + 1, by + 1, bz + 1));

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
            if (this.world.chunks[key].mesh) chunkMeshes.push(this.world.chunks[key].mesh);
        }

        const hits = raycaster.intersectObjects(chunkMeshes);
        if (hits.length > 0 && hits[0].distance < 5.0) return hits[0];
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

        if (this.player.alive && !this.ui.isOpen) {
            let forwardInput = 0; let sideInput = 0;
            if (this.keys['KeyW']) forwardInput += 1;
            if (this.keys['KeyS']) forwardInput -= 1;
            if (this.keys['KeyA']) sideInput -= 1;
            if (this.keys['KeyD']) sideInput += 1;

            const isJumping = this.keys['Space'];
            const isCrouching = this.keys['ShiftLeft'];
            const isSprinting = this.keys['ControlLeft'];

            const yaw = this.cameraYaw;
            const fx = -Math.sin(yaw); const fz = -Math.cos(yaw);
            const rx = Math.cos(yaw); const rz = -Math.sin(yaw);

            let dx = forwardInput * fx + sideInput * rx;
            let dz = forwardInput * fz + sideInput * rz;

            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0) { dx /= len; dz /= len; }

            this.player.tickPhysics(dx, dz, isJumping, isCrouching, isSprinting);
            
            this.camera.position.copy(this.player.position);
            this.camera.position.y += 1.6;
        } else if (!this.player.alive) {
            if (document.pointerLockElement === document.body) document.exitPointerLock();
            this.ui.showDeathScreen();
        }

        this.camera.rotation.set(this.cameraPitch, this.cameraYaw, 0);
        this.camera.updateMatrixWorld();

        this.world.updateVisibleChunks(this.player.position.x, this.player.position.z, this.scene, this.materials);
        this.mobManager.updateMobSpawning(this.player.position, this.world);
        this.mobManager.updateEntities(dt, this.player);
        this.mobManager.renderEntities(this.scene);

        if (!this.ui.isOpen) {
            const target = this.getRaycastIntersection();
            if (target && this.player.alive) {
                const p = target.point.clone().sub(target.face.normal.clone().multiplyScalar(0.5));
                const bx = Math.floor(p.x); const by = Math.floor(p.y); const bz = Math.floor(p.z);
                const targetPosStr = `${bx},${by},${bz}`;

                this.blockSelector.position.set(bx + 0.5, by + 0.5, bz + 0.5);
                this.blockSelector.visible = true;

                if (this.currentTargetPos !== targetPosStr) {
                    this.miningProgress = 0;
                    this.currentTargetPos = targetPosStr;
                    if (this.crackMesh) this.crackMesh.visible = false;
                }

                if (this.isMining) {
                    const bType = this.world.getBlockWorld(bx, by, bz);
                    if (bType !== BLOCK.AIR && bType !== BLOCK.BEDROCK) {
                        const baseTime = this.blockHardness[bType] !== undefined ? this.blockHardness[bType] : 1.0;
                        const toolSpeed = 1.0; 
                        const totalTime = baseTime / toolSpeed;

                        this.miningProgress += dt;

                        if (this.miningProgress >= totalTime) {
                            this.world.setBlockWorld(bx, by, bz, BLOCK.AIR);
                            this.player.inventory.giveItem(bType, 1);
                            this.playSound('break');
                            this.miningProgress = 0;
                            if (this.crackMesh) this.crackMesh.visible = false;
                        } else {
                            if (this.crackMesh) {
                                this.crackMesh.position.set(bx + 0.5, by + 0.5, bz + 0.5);
                                this.crackMesh.visible = true;
                                const stage = Math.floor((this.miningProgress / totalTime) * 10);
                                this.crackMaterial.map.offset.x = Math.max(0, Math.min(9, stage)) / 10;
                            }
                        }
                    } else {
                        this.miningProgress = 0;
                        if (this.crackMesh) this.crackMesh.visible = false;
                    }
                } else {
                    this.miningProgress = 0;
                    if (this.crackMesh) this.crackMesh.visible = false;
                }
            } else {
                this.blockSelector.visible = false;
                if (this.crackMesh) this.crackMesh.visible = false;
                this.miningProgress = 0;
                this.currentTargetPos = null;
            }
        }

        // Обновление системы дня и ночи
        const isNightTime = (this.dayCycle > 0.45 && this.dayCycle < 0.95);
        if (isNightTime) {
            this.dayCycle += (0.5 / NIGHT_DURATION) * dt;
        } else {
            this.dayCycle += (0.5 / DAY_DURATION) * dt;
        }

        if (this.dayCycle >= 1.0) {
            this.dayCycle -= 1.0;
        }

        const sunAngle = this.dayCycle * Math.PI * 2;
        this.sunLight.position.set(Math.cos(sunAngle) * 50, Math.sin(sunAngle) * 50, 15);

        const skyIntensity = Math.max(0.08, Math.sin(sunAngle));
        this.renderer.setClearColor(this.skyColor.clone().multiplyScalar(skyIntensity));
        this.scene.fog.color.copy(this.skyColor).multiplyScalar(skyIntensity);

        const hpBar = document.getElementById('health-bar');
        if (hpBar) hpBar.style.width = `${(this.player.health / this.player.maxHealth) * 100}%`;
        const hgBar = document.getElementById('hunger-bar');
        if (hgBar) hgBar.style.width = `${(this.player.hunger / this.player.maxHunger) * 100}%`;

        this.renderer.render(this.scene, this.camera);
    }
}

window.onload = () => { window.gameInstance = new Game(); };
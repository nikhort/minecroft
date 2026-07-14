// ==========================================
// ФАЙЛ: entities.js
// ИИ, физика, менеджер мобов и снаряды
// ==========================================

// Класс Axis-Aligned Bounding Box (AABB) для расчёта коллизий
class AABB {
    constructor(min, max) {
        this.min = min.clone();
        this.max = max.clone();
    }

    intersects(other) {
        return (this.min.x < other.max.x && this.max.x > other.min.x) &&
               (this.min.y < other.max.y && this.max.y > other.min.y) &&
               (this.min.z < other.max.z && this.max.z > other.min.z);
    }
}

// Базовый класс для всех существ в мире
class Entity {
    constructor(x, y, z, width, height) {
        this.position = new THREE.Vector3(x, y, z);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.width = width;
        this.height = height;
        this.onGround = false;
        this.collidedHorizontally = false;
        this.yaw = 0;
        this.pitch = 0;
    }

    getAABB() {
        const halfW = this.width / 2;
        return new AABB(
            new THREE.Vector3(this.position.x - halfW, this.position.y, this.position.z - halfW),
            new THREE.Vector3(this.position.x + halfW, this.position.y + this.height, this.position.z + halfW)
        );
    }

    checkBlockCollision(pos, world) {
        const halfW = this.width / 2;
        const minX = Math.floor(pos.x - halfW);
        const maxX = Math.ceil(pos.x + halfW);
        const minY = Math.floor(pos.y);
        const maxY = Math.ceil(pos.y + this.height);
        const minZ = Math.floor(pos.z - halfW);
        const maxZ = Math.ceil(pos.z + halfW);

        const entityAABB = new AABB(
            new THREE.Vector3(pos.x - halfW, pos.y, pos.z - halfW),
            new THREE.Vector3(pos.x + halfW, pos.y + this.height, pos.z + halfW)
        );

        for (let x = minX; x < maxX; x++) {
            for (let y = minY; y < maxY; y++) {
                for (let z = minZ; z < maxZ; z++) {
                    const block = world.getBlockWorld(x, y, z);
                    if (block !== BLOCK.AIR && block !== BLOCK.WATER) {
                        const blockAABB = new AABB(
                            new THREE.Vector3(x, y, z),
                            new THREE.Vector3(x + 1, y + 1, z + 1)
                        );
                        if (entityAABB.intersects(blockAABB)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    // Алгоритм скольжения по осям для попиксельной коллизии с вокселями
    moveWithCollision(dx, dy, dz, world) {
        this.collidedHorizontally = false;

        // Движение по оси Y (гравитация/прыжок)
        this.position.y += dy;
        if (this.checkBlockCollision(this.position, world)) {
            if (dy < 0) {
                this.position.y = Math.ceil(this.position.y);
                this.onGround = true;
            } else if (dy > 0) {
                this.position.y = Math.floor(this.position.y + this.height) - this.height;
            }
            this.velocity.y = 0;
        } else {
            if (Math.abs(dy) > 0.001) {
                this.onGround = false;
            }
        }

        // Движение по оси X
        this.position.x += dx;
        if (this.checkBlockCollision(this.position, world)) {
            const halfW = this.width / 2;
            if (dx > 0) {
                this.position.x = Math.floor(this.position.x + halfW) - halfW - 0.001;
            } else if (dx < 0) {
                this.position.x = Math.ceil(this.position.x - halfW) + halfW + 0.001;
            }
            this.velocity.x = 0;
            this.collidedHorizontally = true;
        }

        // Движение по оси Z
        this.position.z += dz;
        if (this.checkBlockCollision(this.position, world)) {
            const halfW = this.width / 2;
            if (dz > 0) {
                this.position.z = Math.floor(this.position.z + halfW) - halfW - 0.001;
            } else if (dz < 0) {
                this.position.z = Math.ceil(this.position.z - halfW) + halfW + 0.001;
            }
            this.velocity.z = 0;
            this.collidedHorizontally = true;
        }
    }
}

// ==========================================
// ИГРОК (Player)
// ==========================================
class Player extends Entity {
    constructor(world) {
        // Спавн по умолчанию (Y=100 гарантирует появление над землей)
        super(0, 100, 0, 0.6, 1.8);
        this.world = world;
        
        this.health = 20;
        this.maxHealth = 20;
        this.hunger = 20;
        this.maxHunger = 20;
        this.alive = true;

        this.inventory = null; // Будет связан динамически
        
        // Корректируем спавн на поверхность земли с защитой от появления в блоках
        const startY = this.world.getSurfaceHeight(0, 0);
        // Если высота меньше 10, вероятно чанк еще не готов, спавним высоко в небе
        this.position.y = startY > 10 ? startY + 2 : 100;
    }

    tickPhysics(dx, dz, isJumping, isCrouching, isSprinting) {
        if (!this.alive) return;

        let speed = 0.07;
        if (isSprinting) speed = 0.11;
        if (isCrouching) speed = 0.03;

        this.velocity.x = dx * speed;
        this.velocity.z = dz * speed;

        // Гравитация
        this.velocity.y -= 0.008;
        if (this.velocity.y < -0.3) this.velocity.y = -0.3;

        // Прыжок
        if (isJumping && this.onGround) {
            this.velocity.y = 0.15;
            this.onGround = false;
        }

        this.moveWithCollision(this.velocity.x, this.velocity.y, this.velocity.z, this.world);
    }

    takeDamage(amount) {
        if (!this.alive) return;
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
        }
    }
}

// ==========================================
// БАЗОВЫЙ КЛАСС ДЛЯ ВСЕХ МОБОВ (Mob)
// ==========================================
class Mob extends Entity {
    constructor(x, y, z, width, height, type) {
        super(x, y, z, width, height);
        this.type = type; // 'sheep', 'cow', 'zombie', etc.
        this.health = 10;
        this.maxHealth = 10;
        this.alive = true;
        this.mesh = null;
        this.damageFlashTimer = 0;

        // Переменные для ИИ
        this.wanderTimer = 0;
        this.targetYaw = 0;
        this.speed = 0.03;
    }

    createMesh() {
        // Оверрайд в дочерних классах
        return new THREE.Group();
    }

    takeDamage(amount, knockbackDir = null) {
        if (!this.alive) return;
        this.health -= amount;
        this.damageFlashTimer = 0.2; // мигнуть красным на 0.2 сек.

        if (knockbackDir) {
            this.velocity.x = knockbackDir.x * 0.1;
            this.velocity.y = 0.08;
            this.velocity.z = knockbackDir.z * 0.1;
        }

        if (this.health <= 0) {
            this.alive = false;
        }
    }

    aiTick(dt, player, world) {
        // Оверрайд ИИ в дочерних классах
    }

    updatePhysics(world) {
        this.velocity.y -= 0.008; // Гравитация
        if (this.velocity.y < -0.3) this.velocity.y = -0.3;

        this.moveWithCollision(this.velocity.x, this.velocity.y, this.velocity.z, world);

        // Плавный поворот в сторону целевого угла
        let diff = this.targetYaw - this.yaw;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.yaw += diff * 0.1;

        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.rotation.y = this.yaw;

            // Красная вспышка при уроне
            if (this.damageFlashTimer > 0) {
                this.damageFlashTimer -= 0.016; // Шаг ~60fps
                this.mesh.traverse((child) => {
                    if (child.isMesh) child.material.color.setHex(0xff3333);
                });
            } else {
                this.resetMeshColor();
            }
        }
    }

    resetMeshColor() {
        // Оверрайд для восстановления исходных текстур / цветов
    }

    getDropItem() {
        return null; // Оверрайд
    }
}

// ==========================================
// ПАССИВНЫЕ МОБЫ
// ==========================================

class Sheep extends Mob {
    constructor(x, y, z) {
        super(x, y, z, 0.9, 1.3, 'sheep');
        this.health = 8;
        this.maxHealth = 8;
        this.mesh = this.createMesh();
    }

    createMesh() {
        const group = new THREE.Group();
        // Тело (шерсть)
        const bodyGeo = new THREE.BoxGeometry(0.9, 0.9, 1.3);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0.65, 0);
        group.add(body);

        // Голова
        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 1.1, 0.65);
        group.add(head);

        // Ноги
        const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
        const legMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
        const legOffsets = [[-0.3, -0.4], [0.3, -0.4], [-0.3, 0.4], [0.3, 0.4]];
        legOffsets.forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(lx, 0.3, lz);
            group.add(leg);
        });

        return group;
    }

    resetMeshColor() {
        if (!this.mesh) return;
        this.mesh.children[0].material.color.setHex(0xffffff);
        this.mesh.children[1].material.color.setHex(0xeeeeee);
        this.mesh.children[2].material.color.setHex(0xdddddd);
    }

    aiTick(dt, player, world) {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            this.wanderTimer = 2 + Math.random() * 4;
            if (Math.random() < 0.4) {
                this.targetYaw = Math.random() * Math.PI * 2;
                this.velocity.x = -Math.sin(this.targetYaw) * this.speed;
                this.velocity.z = -Math.cos(this.targetYaw) * this.speed;
            } else {
                this.velocity.x = 0;
                this.velocity.z = 0;
            }
        }

        // Обход препятствий — автопрыжок
        if (this.collidedHorizontally && this.onGround) {
            this.velocity.y = 0.15;
        }
    }

    getDropItem() {
        return { id: BLOCK.GRASS, count: 1, name: 'White Wool' }; // Заглушка шерсти
    }
}

class Cow extends Mob {
    constructor(x, y, z) {
        super(x, y, z, 0.9, 1.4, 'cow');
        this.health = 10;
        this.maxHealth = 10;
        this.mesh = this.createMesh();
    }

    createMesh() {
        const group = new THREE.Group();
        const bodyGeo = new THREE.BoxGeometry(0.95, 0.95, 1.4);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0.7, 0);
        group.add(body);

        const headGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
        const headMat = new THREE.MeshLambertMaterial({ color: 0x3d2b1f });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 1.1, 0.7);
        group.add(head);

        const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x2b1e14 });
        const legOffsets = [[-0.3, -0.4], [0.3, -0.4], [-0.3, 0.4], [0.3, 0.4]];
        legOffsets.forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(lx, 0.3, lz);
            group.add(leg);
        });
        return group;
    }

    resetMeshColor() {
        if (!this.mesh) return;
        this.mesh.children[0].material.color.setHex(0x5c4033);
        this.mesh.children[1].material.color.setHex(0x3d2b1f);
        this.mesh.children[2].material.color.setHex(0x2b1e14);
    }

    aiTick(dt, player, world) {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            this.wanderTimer = 3 + Math.random() * 3;
            if (Math.random() < 0.5) {
                this.targetYaw = Math.random() * Math.PI * 2;
                this.velocity.x = -Math.sin(this.targetYaw) * this.speed;
                this.velocity.z = -Math.cos(this.targetYaw) * this.speed;
            } else {
                this.velocity.x = 0;
                this.velocity.z = 0;
            }
        }
        if (this.collidedHorizontally && this.onGround) {
            this.velocity.y = 0.15;
        }
    }

    getDropItem() {
        return { id: BLOCK.DIRT, count: 1, name: 'Leather' };
    }
}

class Pig extends Mob {
    constructor(x, y, z) {
        super(x, y, z, 0.9, 0.9, 'pig');
        this.health = 10;
        this.maxHealth = 10;
        this.mesh = this.createMesh();
    }

    createMesh() {
        const group = new THREE.Group();
        const bodyGeo = new THREE.BoxGeometry(0.8, 0.8, 1.2);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffb6c1 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0.45, 0);
        group.add(body);

        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffc0cb });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 0.65, 0.6);
        group.add(head);

        const legGeo = new THREE.BoxGeometry(0.2, 0.4, 0.2);
        const legMat = new THREE.MeshLambertMaterial({ color: 0xffa07a });
        const legOffsets = [[-0.25, -0.35], [0.25, -0.35], [-0.25, 0.35], [0.25, 0.35]];
        legOffsets.forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(lx, 0.2, lz);
            group.add(leg);
        });
        return group;
    }

    resetMeshColor() {
        if (!this.mesh) return;
        this.mesh.children[0].material.color.setHex(0xffb6c1);
        this.mesh.children[1].material.color.setHex(0xffc0cb);
        this.mesh.children[2].material.color.setHex(0xffa07a);
    }

    aiTick(dt, player, world) {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            this.wanderTimer = 2 + Math.random() * 4;
            if (Math.random() < 0.6) {
                this.targetYaw = Math.random() * Math.PI * 2;
                this.velocity.x = -Math.sin(this.targetYaw) * this.speed;
                this.velocity.z = -Math.cos(this.targetYaw) * this.speed;
            } else {
                this.velocity.x = 0;
                this.velocity.z = 0;
            }
        }
        if (this.collidedHorizontally && this.onGround) {
            this.velocity.y = 0.15;
        }
    }

    getDropItem() {
        return { id: BLOCK.PLANK, count: 1, name: 'Porkchop' };
    }
}

class Chicken extends Mob {
    constructor(x, y, z) {
        super(x, y, z, 0.4, 0.7, 'chicken');
        this.health = 4;
        this.maxHealth = 4;
        this.mesh = this.createMesh();
        this.speed = 0.04;
    }

    createMesh() {
        const group = new THREE.Group();
        const bodyGeo = new THREE.BoxGeometry(0.4, 0.4, 0.5);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0.35, 0);
        group.add(body);

        const headGeo = new THREE.BoxGeometry(0.2, 0.25, 0.2);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 0.6, 0.25);
        group.add(head);

        // Клюв
        const beakGeo = new THREE.BoxGeometry(0.1, 0.08, 0.1);
        const beakMat = new THREE.MeshLambertMaterial({ color: 0xffa500 });
        const beak = new THREE.Mesh(beakGeo, beakMat);
        beak.position.set(0, 0.6, 0.38);
        group.add(beak);

        // Ножки
        const legGeo = new THREE.BoxGeometry(0.05, 0.2, 0.05);
        const legMat = new THREE.MeshLambertMaterial({ color: 0xffa500 });
        const l1 = new THREE.Mesh(legGeo, legMat); l1.position.set(-0.1, 0.1, 0); group.add(l1);
        const l2 = new THREE.Mesh(legGeo, legMat); l2.position.set(0.1, 0.1, 0); group.add(l2);

        return group;
    }

    resetMeshColor() {
        if (!this.mesh) return;
        this.mesh.children[0].material.color.setHex(0xffffff);
        this.mesh.children[1].material.color.setHex(0xeeeeee);
        this.mesh.children[2].material.color.setHex(0xffa500);
    }

    aiTick(dt, player, world) {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            this.wanderTimer = 1.5 + Math.random() * 3;
            if (Math.random() < 0.5) {
                this.targetYaw = Math.random() * Math.PI * 2;
                this.velocity.x = -Math.sin(this.targetYaw) * this.speed;
                this.velocity.z = -Math.cos(this.targetYaw) * this.speed;
            } else {
                this.velocity.x = 0;
                this.velocity.z = 0;
            }
        }
        if (this.collidedHorizontally && this.onGround) {
            this.velocity.y = 0.15;
        }
    }

    getDropItem() {
        return { id: BLOCK.LEAVES, count: 1, name: 'Feather' };
    }
}

// ==========================================
// ЖИТЕЛЬ (Villager)
// ==========================================
class Villager extends Mob {
    constructor(x, y, z, villageCenterX, villageCenterZ) {
        super(x, y, z, 0.6, 1.9, 'villager');
        this.health = 20;
        this.maxHealth = 20;
        this.homeX = villageCenterX;
        this.homeZ = villageCenterZ;
        this.mesh = this.createMesh();
    }

    createMesh() {
        const group = new THREE.Group();
        // Ряса (тело)
        const bodyGeo = new THREE.BoxGeometry(0.6, 1.2, 0.6);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b }); // коричневый костюм
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0.8, 0);
        group.add(body);

        // Голова
        const headGeo = new THREE.BoxGeometry(0.4, 0.5, 0.4);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffcc99 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 1.5, 0);
        group.add(head);

        // Знаменитый нос жителя
        const noseGeo = new THREE.BoxGeometry(0.12, 0.25, 0.12);
        const noseMat = new THREE.MeshLambertMaterial({ color: 0xe0a080 });
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.set(0, 1.45, 0.26);
        group.add(nose);

        // Скрещенные руки
        const armsGeo = new THREE.BoxGeometry(0.7, 0.25, 0.35);
        const armsMat = new THREE.MeshLambertMaterial({ color: 0x6e4722 });
        const arms = new THREE.Mesh(armsGeo, armsMat);
        arms.position.set(0, 1.0, 0.22);
        group.add(arms);

        return group;
    }

    resetMeshColor() {
        if (!this.mesh) return;
        this.mesh.children[0].material.color.setHex(0x8b5a2b);
        this.mesh.children[1].material.color.setHex(0xffcc99);
        this.mesh.children[2].material.color.setHex(0xe0a080);
        this.mesh.children[3].material.color.setHex(0x6e4722);
    }

    aiTick(dt, player, world) {
        this.wanderTimer -= dt;
        
        // Ограничение: не отходить далеко от центра деревни (не дальше 45 блоков)
        const dxToHome = this.position.x - this.homeX;
        const dzToHome = this.position.z - this.homeZ;
        const distToHome = Math.sqrt(dxToHome * dxToHome + dzToHome * dzToHome);

        if (distToHome > 45) {
            // Если ушёл слишком далеко — разворачиваем обратно к деревне
            this.targetYaw = Math.atan2(-dxToHome, -dzToHome);
            this.velocity.x = -Math.sin(this.targetYaw) * this.speed;
            this.velocity.z = -Math.cos(this.targetYaw) * this.speed;
        } else if (this.wanderTimer <= 0) {
            this.wanderTimer = 3 + Math.random() * 4;
            if (Math.random() < 0.5) {
                this.targetYaw = Math.random() * Math.PI * 2;
                this.velocity.x = -Math.sin(this.targetYaw) * this.speed;
                this.velocity.z = -Math.cos(this.targetYaw) * this.speed;
            } else {
                this.velocity.x = 0;
                this.velocity.z = 0;
            }
        }

        if (this.collidedHorizontally && this.onGround) {
            this.velocity.y = 0.15;
        }
    }
}

// ==========================================
// ВРАЖДЕБНЫЕ МОБЫ
// ==========================================

class Zombie extends Mob {
    constructor(x, y, z) {
        super(x, y, z, 0.6, 1.8, 'zombie');
        this.health = 20;
        this.maxHealth = 20;
        this.speed = 0.045;
        this.mesh = this.createMesh();
        this.attackCooldown = 0;
    }

    createMesh() {
        const group = new THREE.Group();
        // Одежда
        const bodyGeo = new THREE.BoxGeometry(0.6, 0.75, 0.35);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x008080 }); // Синяя футболка
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0.95, 0);
        group.add(body);

        // Штаны
        const legsGeo = new THREE.BoxGeometry(0.55, 0.6, 0.3);
        const legsMat = new THREE.MeshLambertMaterial({ color: 0x000080 }); // Тёмно-синие штаны
        const legs = new THREE.Mesh(legsGeo, legsMat);
        legs.position.set(0, 0.3, 0);
        group.add(legs);

        // Зелёная голова
        const headGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
        const headMat = new THREE.MeshLambertMaterial({ color: 0x3cb371 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 1.5, 0);
        group.add(head);

        // Протянутые вперёд руки
        const armsGeo = new THREE.BoxGeometry(0.15, 0.15, 0.6);
        const armsMat = new THREE.MeshLambertMaterial({ color: 0x3cb371 });
        const r1 = new THREE.Mesh(armsGeo, armsMat); r1.position.set(-0.25, 1.1, 0.3); group.add(r1);
        const r2 = new THREE.Mesh(armsGeo, armsMat); r2.position.set(0.25, 1.1, 0.3); group.add(r2);

        return group;
    }

    resetMeshColor() {
        if (!this.mesh) return;
        this.mesh.children[0].material.color.setHex(0x008080);
        this.mesh.children[1].material.color.setHex(0x000080);
        this.mesh.children[2].material.color.setHex(0x3cb371);
        this.mesh.children[3].material.color.setHex(0x3cb371);
        this.mesh.children[4].material.color.setHex(0x3cb371);
    }

    aiTick(dt, player, world) {
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        const dist = this.position.distanceTo(player.position);

        if (dist < 16 && player.alive) {
            // Преследовать игрока
            const dx = player.position.x - this.position.x;
            const dz = player.position.z - this.position.z;
            this.targetYaw = Math.atan2(dx, dz);

            this.velocity.x = -Math.sin(this.targetYaw) * this.speed;
            this.velocity.z = -Math.cos(this.targetYaw) * this.speed;

            // Нападение в ближнем бою
            if (dist < 1.3 && this.attackCooldown <= 0) {
                player.takeDamage(3); // Наносит 1.5 сердца
                this.attackCooldown = 1.0;
                // Небольшой отскок назад
                this.velocity.x = -this.velocity.x * 2.0;
                this.velocity.z = -this.velocity.z * 2.0;
            }
        } else {
            // Обычное блуждание
            this.wanderTimer -= dt;
            if (this.wanderTimer <= 0) {
                this.wanderTimer = 3 + Math.random() * 3;
                if (Math.random() < 0.4) {
                    this.targetYaw = Math.random() * Math.PI * 2;
                    this.velocity.x = -Math.sin(this.targetYaw) * (this.speed * 0.5);
                    this.velocity.z = -Math.cos(this.targetYaw) * (this.speed * 0.5);
                } else {
                    this.velocity.x = 0;
                    this.velocity.z = 0;
                }
            }
        }

        if (this.collidedHorizontally && this.onGround) {
            this.velocity.y = 0.15;
        }
    }

    getDropItem() {
        return { id: BLOCK.DIRT, count: 1, name: 'Rotten Flesh' };
    }
}

class Skeleton extends Mob {
    constructor(x, y, z) {
        super(x, y, z, 0.6, 1.8, 'skeleton');
        this.health = 20;
        this.maxHealth = 20;
        this.speed = 0.04;
        this.mesh = this.createMesh();
        this.shootTimer = 1.5;
    }

    createMesh() {
        const group = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: 0xdcdcdc }); // Светло-серые кости

        const bodyGeo = new THREE.BoxGeometry(0.3, 0.75, 0.25);
        const body = new THREE.Mesh(bodyGeo, mat); body.position.set(0, 0.95, 0); group.add(body);

        const legsGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
        const l1 = new THREE.Mesh(legsGeo, mat); l1.position.set(-0.15, 0.3, 0); group.add(l1);
        const l2 = new THREE.Mesh(legsGeo, mat); l2.position.set(0.15, 0.3, 0); group.add(l2);

        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const head = new THREE.Mesh(headGeo, mat); head.position.set(0, 1.5, 0); group.add(head);

        return group;
    }

    resetMeshColor() {
        if (!this.mesh) return;
        this.mesh.traverse((child) => {
            if (child.isMesh) child.material.color.setHex(0xdcdcdc);
        });
    }

    aiTick(dt, player, world) {
        this.shootTimer -= dt;
        const dist = this.position.distanceTo(player.position);

        if (dist < 18 && player.alive) {
            const dx = player.position.x - this.position.x;
            const dz = player.position.z - this.position.z;
            this.targetYaw = Math.atan2(dx, dz);

            if (dist > 10) {
                // Подходить поближе
                this.velocity.x = -Math.sin(this.targetYaw) * this.speed;
                this.velocity.z = -Math.cos(this.targetYaw) * this.speed;
            } else if (dist < 6) {
                // Отступать назад
                this.velocity.x = Math.sin(this.targetYaw) * this.speed;
                this.velocity.z = Math.cos(this.targetYaw) * this.speed;
            } else {
                this.velocity.x = 0;
                this.velocity.z = 0;
            }

            // Стрельба по игроку
            if (this.shootTimer <= 0) {
                this.shootTimer = 2.0 + Math.random() * 1.5;
                this.shootArrow(player);
            }
        } else {
            this.wanderTimer -= dt;
            if (this.wanderTimer <= 0) {
                this.wanderTimer = 2 + Math.random() * 3;
                if (Math.random() < 0.4) {
                    this.targetYaw = Math.random() * Math.PI * 2;
                    this.velocity.x = -Math.sin(this.targetYaw) * (this.speed * 0.5);
                    this.velocity.z = -Math.cos(this.targetYaw) * (this.speed * 0.5);
                } else {
                    this.velocity.x = 0;
                    this.velocity.z = 0;
                }
            }
        }

        if (this.collidedHorizontally && this.onGround) {
            this.velocity.y = 0.15;
        }
    }

    shootArrow(player) {
        if (!window.gameInstance || !window.gameInstance.mobManager) return;

        // Вектор от глаз скелета к голове игрока
        const arrowStart = this.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        const targetPos = player.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        const direction = targetPos.clone().sub(arrowStart).normalize();

        const arrow = new Arrow(arrowStart.x, arrowStart.y, arrowStart.z, direction);
        window.gameInstance.mobManager.arrows.push(arrow);
        window.gameInstance.scene.add(arrow.mesh);
    }

    getDropItem() {
        return { id: BLOCK.LEAVES, count: 2, name: 'Bone / Arrow' };
    }
}

class Creeper extends Mob {
    constructor(x, y, z) {
        super(x, y, z, 0.6, 1.7, 'creeper');
        this.health = 20;
        this.maxHealth = 20;
        this.speed = 0.05;
        this.mesh = this.createMesh();

        this.fuse = 0;
        this.maxFuse = 1.5; // Время до детонации
        this.isHissing = false;
    }

    createMesh() {
        const group = new THREE.Group();
        const bodyGeo = new THREE.BoxGeometry(0.5, 0.85, 0.35);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x228b22 }); // Зелёный лесной
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0.75, 0);
        group.add(body);

        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const headMat = new THREE.MeshLambertMaterial({ color: 0x32cd32 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 1.35, 0);
        group.add(head);

        // 4 лапы внизу
        const legGeo = new THREE.BoxGeometry(0.2, 0.35, 0.2);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x006400 });
        const offsets = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
        offsets.forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(lx, 0.17, lz);
            group.add(leg);
        });
        return group;
    }

    resetMeshColor() {
        if (!this.mesh) return;
        this.mesh.children[0].material.color.setHex(0x228b22);
        this.mesh.children[1].material.color.setHex(0x32cd32);
        for (let i = 2; i < 6; i++) {
            this.mesh.children[i].material.color.setHex(0x006400);
        }
    }

    aiTick(dt, player, world) {
        const dist = this.position.distanceTo(player.position);

        if (dist < 16 && player.alive) {
            const dx = player.position.x - this.position.x;
            const dz = player.position.z - this.position.z;
            this.targetYaw = Math.atan2(dx, dz);

            if (dist > 3.0) {
                // Если далеко — идём, прерывая шипение
                this.isHissing = false;
                this.fuse = Math.max(0, this.fuse - dt * 2.0);
                this.velocity.x = -Math.sin(this.targetYaw) * this.speed;
                this.velocity.z = -Math.cos(this.targetYaw) * this.speed;
            } else {
                // Вплотную — останавливаемся и начинаем детонацию
                this.isHissing = true;
                this.velocity.x = 0;
                this.velocity.z = 0;
                this.fuse += dt;

                // Свечение при взрыве (пульсация)
                const fuseRatio = this.fuse / this.maxFuse;
                if (this.mesh) {
                    const whiteMat = new THREE.Color(0xffffff).multiplyScalar(Math.sin(fuseRatio * Math.PI * 8) * 0.5 + 0.5);
                    this.mesh.traverse((child) => {
                        if (child.isMesh && child.material.emissive) {
                            child.material.emissive.copy(whiteMat);
                        }
                    });
                }

                if (this.fuse >= this.maxFuse) {
                    this.explode(player);
                }
            }
        } else {
            this.isHissing = false;
            this.fuse = Math.max(0, this.fuse - dt);
            this.wanderTimer -= dt;
            if (this.wanderTimer <= 0) {
                this.wanderTimer = 3 + Math.random() * 3;
                if (Math.random() < 0.3) {
                    this.targetYaw = Math.random() * Math.PI * 2;
                    this.velocity.x = -Math.sin(this.targetYaw) * (this.speed * 0.5);
                    this.velocity.z = -Math.cos(this.targetYaw) * (this.speed * 0.5);
                } else {
                    this.velocity.x = 0;
                    this.velocity.z = 0;
                }
            }
        }

        if (this.collidedHorizontally && this.onGround) {
            this.velocity.y = 0.15;
        }
    }

    explode(player) {
        this.alive = false; // Удалить моба из списка

        const dist = this.position.distanceTo(player.position);
        if (dist < 6.0 && player.alive) {
            const damage = Math.max(1, Math.floor((1 - (dist / 6.0)) * 18));
            player.takeDamage(damage);

            // Физический толчок/отбрасывание игрока взрывом
            const pushDir = player.position.clone().sub(this.position).normalize();
            pushDir.y = 0.5; // Всегда подбрасывать вверх
            player.velocity.add(pushDir.multiplyScalar(0.25));
        }

        // Проигрывание взрывной волны (визуализация частицами)
        if (window.gameInstance) {
            window.gameInstance.playSound('break'); // Низкочастотный звук
            const explosionGeo = new THREE.SphereGeometry(1.8, 8, 8);
            const explosionMat = new THREE.MeshBasicMaterial({ color: 0xff8c00, transparent: true, opacity: 0.8 });
            const sphere = new THREE.Mesh(explosionGeo, explosionMat);
            sphere.position.copy(this.position);
            window.gameInstance.scene.add(sphere);

            setTimeout(() => {
                window.gameInstance.scene.remove(sphere);
            }, 150);
        }
    }

    getDropItem() {
        return { id: BLOCK.STONE, count: 1, name: 'Gunpowder' };
    }
}

class Spider extends Mob {
    constructor(x, y, z) {
        super(x, y, z, 1.4, 0.8, 'spider');
        this.health = 16;
        this.maxHealth = 16;
        this.speed = 0.07; // Быстрый моб
        this.mesh = this.createMesh();
        this.jumpCooldown = 0;
    }

    createMesh() {
        const group = new THREE.Group();
        // Плоское приплюснутое тело
        const bodyGeo = new THREE.BoxGeometry(0.8, 0.5, 1.1);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0.4, 0);
        group.add(body);

        // Голова с красными глазами
        const headGeo = new THREE.BoxGeometry(0.5, 0.4, 0.4);
        const headMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 0.4, 0.65);
        group.add(head);

        // 8 расставленных лап
        const legGeo = new THREE.BoxGeometry(0.6, 0.08, 0.08);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x0f0f0f });
        for (let i = 0; i < 4; i++) {
            const zOff = -0.3 + i * 0.2;
            // Левая лапа
            const lLeg = new THREE.Mesh(legGeo, legMat);
            lLeg.position.set(-0.6, 0.35, zOff);
            lLeg.rotation.z = 0.2;
            group.add(lLeg);
            // Правая лапа
            const rLeg = new THREE.Mesh(legGeo, legMat);
            rLeg.position.set(0.6, 0.35, zOff);
            rLeg.rotation.z = -0.2;
            group.add(rLeg);
        }

        return group;
    }

    resetMeshColor() {
        if (!this.mesh) return;
        this.mesh.children[0].material.color.setHex(0x1a1a1a);
        this.mesh.children[1].material.color.setHex(0x111111);
    }

    aiTick(dt, player, world) {
        if (this.jumpCooldown > 0) this.jumpCooldown -= dt;

        const dist = this.position.distanceTo(player.position);

        if (dist < 16 && player.alive) {
            const dx = player.position.x - this.position.x;
            const dz = player.position.z - this.position.z;
            this.targetYaw = Math.atan2(dx, dz);

            this.velocity.x = -Math.sin(this.targetYaw) * this.speed;
            this.velocity.z = -Math.cos(this.targetYaw) * this.speed;

            // Наскок-прыжок паука
            if (dist < 4.5 && this.onGround && this.jumpCooldown <= 0) {
                this.velocity.y = 0.14;
                this.velocity.x *= 1.8;
                this.velocity.z *= 1.8;
                this.jumpCooldown = 2.0;
            }

            // Нанесение контактного урона
            if (dist < 1.4) {
                player.takeDamage(2);
                this.velocity.x = -this.velocity.x;
                this.velocity.z = -this.velocity.z;
            }
        } else {
            this.wanderTimer -= dt;
            if (this.wanderTimer <= 0) {
                this.wanderTimer = 2 + Math.random() * 3;
                if (Math.random() < 0.5) {
                    this.targetYaw = Math.random() * Math.PI * 2;
                    this.velocity.x = -Math.sin(this.targetYaw) * (this.speed * 0.5);
                    this.velocity.z = -Math.cos(this.targetYaw) * (this.speed * 0.5);
                } else {
                    this.velocity.x = 0;
                    this.velocity.z = 0;
                }
            }
        }

        // ОСОБЕННОСТЬ: Карабканье по стенам.
        // Если паук упёрся горизонтально в стену, он её «обползает» без сильной гравитации.
        if (this.collidedHorizontally) {
            this.velocity.y = 0.05; // Медленное левитирование вверх
        }
    }

    getDropItem() {
        return { id: BLOCK.LEAVES, count: 1, name: 'String / Spider Eye' };
    }
}

// ==========================================
// СТРЕЛА (Снаряд Скелета)
// ==========================================
class Arrow {
    constructor(x, y, z, dir) {
        this.position = new THREE.Vector3(x, y, z);
        this.velocity = dir.clone().multiplyScalar(0.24); // Скорость стрелы
        this.alive = true;
        this.lifeTimer = 5.0; // исчезнет через 5 сек

        const arrowGeo = new THREE.BoxGeometry(0.08, 0.08, 0.4);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0x999999 });
        this.mesh = new THREE.Mesh(arrowGeo, arrowMat);
        this.mesh.position.copy(this.position);
    }

    update(dt, player, world) {
        this.lifeTimer -= dt;
        if (this.lifeTimer <= 0) {
            this.alive = false;
            return;
        }

        // Физика гравитации стрелы
        this.velocity.y -= 0.005;

        this.position.add(this.velocity);
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            // Развернуть стрелу по вектору движения
            const target = this.position.clone().add(this.velocity);
            this.mesh.lookAt(target);
        }

        // Коллизия с игроком
        if (player.alive) {
            const dist = this.position.distanceTo(player.position.clone().add(new THREE.Vector3(0, 0.9, 0)));
            if (dist < 0.7) {
                player.takeDamage(2); // Снимает 1 сердечко
                this.alive = false;
                return;
            }
        }

        // Коллизия с блоками
        const bx = Math.floor(this.position.x);
        const by = Math.floor(this.position.y);
        const bz = Math.floor(this.position.z);
        const block = world.getBlockWorld(bx, by, bz);
        if (block !== BLOCK.AIR && block !== BLOCK.WATER) {
            this.alive = false; // Стрела застряла в блоке
        }
    }
}

// ==========================================
// ВЫПАВШИЙ ПРЕДМЕТ (ItemDrop)
// ==========================================
class ItemDrop {
    constructor(x, y, z, itemInfo) {
        this.position = new THREE.Vector3(x, y, z);
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.04,
            0.1,
            (Math.random() - 0.5) * 0.04
        );
        this.item = itemInfo; // { id, count, name }
        this.alive = true;
        this.mesh = this.createMesh();
        this.rotationY = 0;
    }

    createMesh() {
        const size = 0.25;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshLambertMaterial({ color: 0xffff00 }); // Жёлтый контейнер лута
        const box = new THREE.Mesh(geo, mat);
        box.position.copy(this.position);
        return box;
    }

    update(dt, player, world) {
        // Сила тяжести
        this.velocity.y -= 0.005;

        // Попиксельное скольжение для предметов
        const minX = Math.floor(this.position.x - 0.1);
        const maxX = Math.ceil(this.position.x + 0.1);
        const minY = Math.floor(this.position.y);
        const maxY = Math.ceil(this.position.y + 0.25);
        const minZ = Math.floor(this.position.z - 0.1);
        const maxZ = Math.ceil(this.position.z + 0.1);

        const entityAABB = new AABB(
            new THREE.Vector3(this.position.x - 0.1, this.position.y, this.position.z - 0.1),
            new THREE.Vector3(this.position.x + 0.1, this.position.y + 0.25, this.position.z + 0.1)
        );

        let colliding = false;
        for (let x = minX; x < maxX; x++) {
            for (let y = minY; y < maxY; y++) {
                for (let z = minZ; z < maxZ; z++) {
                    const b = world.getBlockWorld(x, y, z);
                    if (b !== BLOCK.AIR && b !== BLOCK.WATER) {
                        const blockAABB = new AABB(
                            new THREE.Vector3(x, y, z),
                            new THREE.Vector3(x + 1, y + 1, z + 1)
                        );
                        if (entityAABB.intersects(blockAABB)) {
                            colliding = true;
                            break;
                        }
                    }
                }
            }
        }

        if (colliding) {
            this.position.y = Math.ceil(this.position.y);
            this.velocity.y = 0;
            this.velocity.x = 0;
            this.velocity.z = 0;
        } else {
            this.position.add(this.velocity);
        }

        // Вращение предмета
        this.rotationY += dt * 1.5;

        if (this.mesh) {
            this.mesh.position.copy(this.position);
            // Сделать эффект левитации (парения)
            this.mesh.position.y += Math.sin(this.rotationY * 2.0) * 0.04;
            this.mesh.rotation.y = this.rotationY;
        }

        // Механика подбора предмета
        const distToPlayer = this.position.distanceTo(player.position);
        if (distToPlayer < 1.3 && player.alive) {
            if (player.inventory) {
                player.inventory.giveItem(this.item.id, this.item.count);
                if (window.gameInstance) window.gameInstance.playSound('place'); // Приятный щелчок подбора
            }
            this.alive = false;
        }
    }
}

// ==========================================
// МЕНЕДЖЕР МОБОВ (MobManager)
// ==========================================
class MobManager {
    constructor(game) {
        this.game = game;
        this.mobs = [];
        this.arrows = [];
        this.drops = [];
        this.spawnTimer = 0;
    }

    updateMobSpawning(playerPosition, world) {
        this.spawnTimer += 0.016; // Вызывается каждый кадр
        if (this.spawnTimer < 3.0) return; // Проверка на спавн каждые 3 секунды
        this.spawnTimer = 0;

        // Лимит существ в мире вокруг игрока
        if (this.mobs.length >= 25) return;

        // Получить текущее время суток через game.dayCycle (0..0.45 - день, 0.45..0.95 - ночь)
        const isNight = (this.game.dayCycle > 0.45 && this.game.dayCycle < 0.95);

        // Дистанция спавна: от 24 до 70 блоков вокруг игрока
        const angle = Math.random() * Math.PI * 2;
        const dist = 24 + Math.random() * 46;
        const sx = Math.floor(playerPosition.x + Math.cos(angle) * dist);
        const sz = Math.floor(playerPosition.z + Math.sin(angle) * dist);

        // Получаем высоту поверхности в этой координате
        const sy = world.getSurfaceHeight(sx, sz);
        if (sy < 1 || sy > 120) return;

        // Проверяем, свободен ли блок спавна
        const blockAtFloor = world.getBlockWorld(sx, sy, sz);
        const blockAtAir = world.getBlockWorld(sx, sy + 1, sz);
        if (blockAtFloor === BLOCK.AIR || blockAtAir !== BLOCK.AIR) return;

        let newMob = null;
        if (isNight) {
            // Спавн враждебных мобов ночью
            const r = Math.random();
            if (r < 0.3) {
                newMob = new Zombie(sx, sy + 1, sz);
            } else if (r < 0.55) {
                newMob = new Skeleton(sx, sy + 1, sz);
            } else if (r < 0.8) {
                newMob = new Creeper(sx, sy + 1, sz);
            } else {
                newMob = new Spider(sx, sy + 1, sz);
            }
        } else {
            // Спавн дружелюбных мобов днём
            const r = Math.random();
            if (r < 0.3) {
                newMob = new Sheep(sx, sy + 1, sz);
            } else if (r < 0.6) {
                newMob = new Cow(sx, sy + 1, sz);
            } else if (r < 0.85) {
                newMob = new Pig(sx, sy + 1, sz);
            } else {
                newMob = new Chicken(sx, sy + 1, sz);
            }
        }

        if (newMob) {
            this.mobs.push(newMob);
            this.game.scene.add(newMob.mesh);
        }
    }

    updateEntities(dt, player) {
        // Обновление мобов
        for (let i = this.mobs.length - 1; i >= 0; i--) {
            const mob = this.mobs[i];

            // Солнечный ожог зомби/скелетов днём под открытым небом
            const isDay = !(this.game.dayCycle > 0.45 && this.game.dayCycle < 0.95);
            if (isDay && (mob.type === 'zombie' || mob.type === 'skeleton')) {
                const height = this.game.world.getSurfaceHeight(Math.floor(mob.position.x), Math.floor(mob.position.z));
                if (mob.position.y >= height) {
                    mob.takeDamage(0.05); // Горит на солнце
                }
            }

            if (!mob.alive) {
                // Создание выпавшего предмета перед смертью
                const drop = mob.getDropItem();
                if (drop) {
                    const itemDrop = new ItemDrop(mob.position.x, mob.position.y + 0.5, mob.position.z, drop);
                    this.drops.push(itemDrop);
                    this.game.scene.add(itemDrop.mesh);
                }

                this.game.scene.remove(mob.mesh);
                this.mobs.splice(i, 1);
                continue;
            }

            // ИИ ход и коллизии
            mob.aiTick(dt, player, this.game.world);
            mob.updatePhysics(this.game.world);
        }

        // Обновление стрел
        for (let i = this.arrows.length - 1; i >= 0; i--) {
            const arrow = this.arrows[i];
            arrow.update(dt, player, this.game.world);
            if (!arrow.alive) {
                this.game.scene.remove(arrow.mesh);
                this.arrows.splice(i, 1);
            }
        }

        // Обновление выпавшего лута
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const drop = this.drops[i];
            drop.update(dt, player, this.game.world);
            if (!drop.alive) {
                this.game.scene.remove(drop.mesh);
                this.drops.splice(i, 1);
            }
        }
    }

    renderEntities(scene) {
        // Объекты обновляют свои положения внутри updateEntities.
        // Данный метод гарантирует, что все объекты добавлены в Three.js.
        this.mobs.forEach((mob) => {
            if (mob.mesh && !scene.children.includes(mob.mesh)) {
                scene.add(mob.mesh);
            }
        });
        this.drops.forEach((drop) => {
            if (drop.mesh && !scene.children.includes(drop.mesh)) {
                scene.add(drop.mesh);
            }
        });
    }

    clearAllHostileMobs() {
        for (let i = this.mobs.length - 1; i >= 0; i--) {
            const mob = this.mobs[i];
            if (mob.type === 'zombie' || mob.type === 'skeleton' || mob.type === 'creeper' || mob.type === 'spider') {
                this.game.scene.remove(mob.mesh);
                this.mobs.splice(i, 1);
            }
        }
    }
}
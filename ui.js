// ==========================================
// ФАЙЛ: ui.js
// Система инвентаря, HUD и экран Возрождения
// ==========================================

class InventorySystem {
    constructor() {
        this.slots = Array(36).fill(null); // Инвентарь на 36 слотов
        this.selectedHotbarIndex = 0;      // Выбранный слот быстрого доступа
    }

    giveItem(id, count) {
        // Поиск существующего стака
        for (let i = 0; i < this.slots.length; i++) {
            if (this.slots[i] && this.slots[i].id === id) {
                this.slots[i].count += count;
                this.updateUI();
                return;
            }
        }
        // Поиск пустого слота
        for (let i = 0; i < this.slots.length; i++) {
            if (!this.slots[i]) {
                this.slots[i] = { id, count };
                this.updateUI();
                return;
            }
        }
    }

    decreaseSelectedItem() {
        const item = this.getSelectedItem();
        if (item) {
            item.count--;
            if (item.count <= 0) {
                this.slots[this.selectedHotbarIndex] = null;
            }
            this.updateUI();
        }
    }

    getSelectedItem() {
        return this.slots[this.selectedHotbarIndex];
    }

    updateUI() {
        // Синхронизация со всеми 36 слотами (9 в хотбаре + 27 в инвентаре)
        for (let i = 0; i < 36; i++) {
            const slotEl = document.getElementById(`slot-${i}`);
            if (slotEl) {
                // Выделение активного слота в хотбаре
                if (i < 9) {
                    if (i === this.selectedHotbarIndex) {
                        slotEl.classList.add('selected');
                    } else {
                        slotEl.classList.remove('selected');
                    }
                }

                const item = this.slots[i];
                if (item) {
                    slotEl.innerHTML = `<span class="item-icon block-${item.id}"></span><span class="count">${item.count}</span>`;
                } else {
                    slotEl.innerHTML = '';
                }
            }
        }
    }
}

class UISystem extends InventorySystem {
    constructor() {
        super();
        this.initHUD();
        this.initInventoryGrid();
        this.initCloseButton();
        this.createDeathScreen();
    }

    initHUD() {
        // Создание сетки быстрого доступа, если отсутствует в исходном HTML
        let hotbar = document.getElementById('hotbar');
        if (!hotbar) {
            hotbar = document.createElement('div');
            hotbar.id = 'hotbar';
            hotbar.style.position = 'fixed';
            hotbar.style.bottom = '20px';
            hotbar.style.left = '50%';
            hotbar.style.transform = 'translateX(-50%)';
            hotbar.style.display = 'flex';
            hotbar.style.background = 'rgba(0, 0, 0, 0.4)';
            hotbar.style.border = '4px solid #333';
            hotbar.style.padding = '4px';
            hotbar.style.zIndex = '1000';
            document.body.appendChild(hotbar);
        }

        // Убедимся, что 9 слотов хотбара созданы
        if (hotbar.children.length === 0) {
            for (let i = 0; i < 9; i++) {
                const slot = document.createElement('div');
                slot.id = `slot-${i}`;
                slot.className = 'slot';
                if (i === 0) slot.classList.add('selected');
                hotbar.appendChild(slot);
            }
        }

        // Добавляем обработчики клика на слоты хотбара
        for (let i = 0; i < 9; i++) {
            const slotEl = document.getElementById(`slot-${i}`);
            if (slotEl && !slotEl.hasAttribute('data-click-bound')) {
                slotEl.setAttribute('data-click-bound', 'true');
                slotEl.addEventListener('click', () => {
                    this.selectedHotbarIndex = i;
                    this.updateUI();
                });
            }
        }
    }

    initInventoryGrid() {
        // Создание 27 слотов инвентаря внутри окна инвентаря (#player-inventory)
        const invGrid = document.getElementById('player-inventory');
        if (invGrid && invGrid.children.length === 0) {
            for (let i = 9; i < 36; i++) {
                const slot = document.createElement('div');
                slot.id = `slot-${i}`;
                slot.className = 'slot';
                
                // Клик для обмена предметами с выбранным слотом хотбара
                slot.addEventListener('click', () => {
                    const temp = this.slots[this.selectedHotbarIndex];
                    this.slots[this.selectedHotbarIndex] = this.slots[i];
                    this.slots[i] = temp;
                    this.updateUI();
                });
                
                invGrid.appendChild(slot);
            }
        }
    }

    initCloseButton() {
        // Обработчик кнопки закрытия окна инвентаря
        const closeBtn = document.getElementById('ui-close-btn');
        if (closeBtn && !closeBtn.hasAttribute('data-click-bound')) {
            closeBtn.setAttribute('data-click-bound', 'true');
            closeBtn.addEventListener('click', () => {
                const overlay = document.getElementById('ui-overlay');
                if (overlay) {
                    overlay.classList.add('hidden');
                    document.body.requestPointerLock();
                }
            });
        }
    }

    // Инициализация полностью кастомного окна «Вы погибли» прямо из кода
    createDeathScreen() {
        if (document.getElementById('death-screen')) return;

        const ds = document.createElement('div');
        ds.id = 'death-screen';
        ds.style.position = 'fixed';
        ds.style.top = '0';
        ds.style.left = '0';
        ds.style.width = '100vw';
        ds.style.height = '100vh';
        ds.style.backgroundColor = 'rgba(139, 0, 0, 0.7)'; // Красно-кровавое затенение
        ds.style.display = 'none';
        ds.style.flexDirection = 'column';
        ds.style.justifyContent = 'center';
        ds.style.alignItems = 'center';
        ds.style.zIndex = '999999';
        ds.style.fontFamily = '"Courier New", Courier, monospace';

        const text = document.createElement('h1');
        text.innerText = 'Вы погибли!';
        text.style.color = '#ff4444';
        text.style.fontSize = '3.5rem';
        text.style.textShadow = '3px 3px 0px #000000';
        text.style.marginBottom = '30px';
        ds.appendChild(text);

        const respawnBtn = document.createElement('button');
        respawnBtn.id = 'respawn-button';
        respawnBtn.innerText = 'Возродиться';
        respawnBtn.style.padding = '15px 35px';
        respawnBtn.style.fontSize = '1.8rem';
        respawnBtn.style.color = '#ffffff';
        respawnBtn.style.backgroundColor = '#555555';
        respawnBtn.style.border = '3px solid #ffffff';
        respawnBtn.style.boxShadow = '4px 4px 0px #000000';
        respawnBtn.style.cursor = 'pointer';

        respawnBtn.addEventListener('mouseover', () => {
            respawnBtn.style.backgroundColor = '#777777';
        });
        respawnBtn.addEventListener('mouseout', () => {
            respawnBtn.style.backgroundColor = '#555555';
        });
        respawnBtn.addEventListener('click', () => {
            if (window.gameInstance) {
                window.gameInstance.respawn();
            }
        });

        ds.appendChild(respawnBtn);
        document.body.appendChild(ds);
    }

    showDeathScreen() {
        const ds = document.getElementById('death-screen');
        if (ds) {
            ds.style.display = 'flex';
        }
    }

    hideDeathScreen() {
        const ds = document.getElementById('death-screen');
        if (ds) {
            ds.style.display = 'none';
        }
    }
}
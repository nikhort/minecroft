// ==========================================
// ФАЙЛ: ui.js
// Система инвентаря, HUD, Drag&Drop и Рецепты крафта
// ==========================================

// РЕЦЕПТЫ КРАФТА (как в Minecraft)
// Важно: шаблоны выровнены до точных границ, без лишних пробелов по бокам.
const RECIPES = [
    // Доски (1 дерево = 4 доски)
    { pattern: ["W"], ingredients: { W: 4 /* WOOD */ }, result: { id: 6 /* PLANK */, count: 4 } },
    // Верстак
    { pattern: ["PP", "PP"], ingredients: { P: 6 /* PLANK */ }, result: { id: 14 /* CRAFTING_TABLE */, count: 1 } },
    // Палки (2 доски вертикально = 4 палки)
    { pattern: ["P", "P"], ingredients: { P: 6 /* PLANK */ }, result: { id: 30 /* STICK */, count: 4 } },
    
    // ДЕРЕВЯННЫЕ ИНСТРУМЕНТЫ (P = PLANK 6, S = STICK 30)
    { pattern: ["PPP", " S ", " S "], ingredients: { P: 6, S: 30 }, result: { id: 33 /* W_PICKAXE */, count: 1 } },
    { pattern: ["PP", "PS", " S"], ingredients: { P: 6, S: 30 }, result: { id: 34 /* W_AXE */, count: 1 } },
    { pattern: ["PP", "SP", "S "], ingredients: { P: 6, S: 30 }, result: { id: 34 /* W_AXE */, count: 1 } },
    { pattern: ["P", "S", "S"], ingredients: { P: 6, S: 30 }, result: { id: 32 /* W_SHOVEL */, count: 1 } },
    { pattern: ["P", "P", "S"], ingredients: { P: 6, S: 30 }, result: { id: 31 /* W_SWORD */, count: 1 } },
    { pattern: ["PP", " S", " S"], ingredients: { P: 6, S: 30 }, result: { id: 35 /* W_HOE */, count: 1 } },
    { pattern: ["PP", "S ", "S "], ingredients: { P: 6, S: 30 }, result: { id: 35 /* W_HOE */, count: 1 } },

    // КАМЕННЫЕ ИНСТРУМЕНТЫ (C = COBBLESTONE 7, S = STICK 30)
    { pattern: ["CCC", " S ", " S "], ingredients: { C: 7, S: 30 }, result: { id: 38 /* S_PICKAXE */, count: 1 } },
    { pattern: ["CC", "CS", " S"], ingredients: { C: 7, S: 30 }, result: { id: 39 /* S_AXE */, count: 1 } },
    { pattern: ["CC", "SC", "S "], ingredients: { C: 7, S: 30 }, result: { id: 39 /* S_AXE */, count: 1 } },
    { pattern: ["C", "S", "S"], ingredients: { C: 7, S: 30 }, result: { id: 37 /* S_SHOVEL */, count: 1 } },
    { pattern: ["C", "C", "S"], ingredients: { C: 7, S: 30 }, result: { id: 36 /* S_SWORD */, count: 1 } },
    { pattern: ["CC", " S", " S"], ingredients: { C: 7, S: 30 }, result: { id: 40 /* S_HOE */, count: 1 } },
    { pattern: ["CC", "S ", "S "], ingredients: { C: 7, S: 30 }, result: { id: 40 /* S_HOE */, count: 1 } },
];

class UISystem {
    constructor() {
        this.slots = Array(36).fill(null); // 0-8 хотбар, 9-35 основной
        this.selectedHotbarIndex = 0;
        
        this.crafting2x2 = Array(4).fill(null);
        this.crafting3x3 = Array(9).fill(null);
        this.outputSlot = null;
        
        this.cursorItem = null;
        this.isOpen = false;
        this.currentCraftMode = '2x2';

        this.initDOM();
        this.initEvents();
    }

    initDOM() {
        this.createGrid('hotbar', 9, 0);
        this.createGrid('player-inventory-hotbar', 9, 0);
        this.createGrid('player-inventory', 27, 9);
        this.createGrid('crafting-2x2', 4, 0);
        this.createGrid('crafting-3x3', 9, 0);

        document.getElementById('crafting-2x2-output').addEventListener('mousedown', (e) => this.handleOutputClick(e));
        document.getElementById('crafting-3x3-output').addEventListener('mousedown', (e) => this.handleOutputClick(e));
        
        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    createGrid(containerId, count, startIndex) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.dataset.index = startIndex + i;
            slot.dataset.container = containerId;
            
            slot.addEventListener('mousedown', (e) => {
                if (containerId.includes('hotbar') && !this.isOpen) {
                    if (e.button === 0) {
                        this.selectedHotbarIndex = startIndex + i;
                        this.updateUI();
                    }
                } else if (this.isOpen) {
                    this.handleSlotClick(e, containerId, startIndex + i);
                }
            });
            container.appendChild(slot);
        }
    }

    initEvents() {
        document.addEventListener('mousemove', (e) => {
            const draggedEl = document.getElementById('dragged-item');
            if (this.cursorItem && this.isOpen) {
                draggedEl.style.left = e.clientX + 'px';
                draggedEl.style.top = e.clientY + 'px';
            }
        });
    }

    giveItem(id, count) {
        for (let i = 0; i < this.slots.length; i++) {
            if (this.slots[i] && this.slots[i].id === id && this.slots[i].count < 64) {
                const space = 64 - this.slots[i].count;
                if (count <= space) {
                    this.slots[i].count += count;
                    this.updateUI();
                    return;
                } else {
                    this.slots[i].count = 64;
                    count -= space;
                }
            }
        }
        for (let i = 0; i < this.slots.length; i++) {
            if (!this.slots[i]) {
                this.slots[i] = { id, count };
                this.updateUI();
                return;
            }
        }
    }

    getSelectedItem() {
        return this.slots[this.selectedHotbarIndex];
    }

    decreaseSelectedItem() {
        const item = this.getSelectedItem();
        if (item) {
            item.count--;
            if (item.count <= 0) this.slots[this.selectedHotbarIndex] = null;
            this.updateUI();
        }
    }

    handleSlotClick(e, containerId, index) {
        const isRightClick = e.button === 2;
        let targetArray = null;

        if (containerId.includes('player-inventory') || containerId === 'hotbar') targetArray = this.slots;
        else if (containerId === 'crafting-2x2') targetArray = this.crafting2x2;
        else if (containerId === 'crafting-3x3') targetArray = this.crafting3x3;

        if (!targetArray) return;

        let slotItem = targetArray[index];

        if (this.cursorItem) {
            if (!slotItem) {
                if (isRightClick) {
                    targetArray[index] = { id: this.cursorItem.id, count: 1 };
                    this.cursorItem.count--;
                    if (this.cursorItem.count <= 0) this.cursorItem = null;
                } else {
                    targetArray[index] = { ...this.cursorItem };
                    this.cursorItem = null;
                }
            } else if (slotItem.id === this.cursorItem.id) {
                if (isRightClick) {
                    if (slotItem.count < 64) {
                        slotItem.count++;
                        this.cursorItem.count--;
                        if (this.cursorItem.count <= 0) this.cursorItem = null;
                    }
                } else {
                    let space = 64 - slotItem.count;
                    let amount = Math.min(space, this.cursorItem.count);
                    slotItem.count += amount;
                    this.cursorItem.count -= amount;
                    if (this.cursorItem.count <= 0) this.cursorItem = null;
                }
            } else {
                let temp = targetArray[index];
                targetArray[index] = this.cursorItem;
                this.cursorItem = temp;
            }
        } else {
            if (slotItem) {
                if (isRightClick) {
                    let take = Math.ceil(slotItem.count / 2);
                    this.cursorItem = { id: slotItem.id, count: take };
                    slotItem.count -= take;
                    if (slotItem.count <= 0) targetArray[index] = null;
                } else {
                    this.cursorItem = { ...slotItem };
                    targetArray[index] = null;
                }
            }
        }

        if (containerId.includes('crafting')) this.checkRecipes();
        this.updateUI();
    }

    checkRecipes() {
        let grid = this.currentCraftMode === '2x2' ? this.crafting2x2 : this.crafting3x3;
        let cols = this.currentCraftMode === '2x2' ? 2 : 3;
        
        this.outputSlot = this.matchRecipe(grid, cols);
        this.updateUI();
    }

    matchRecipe(grid, columns) {
        let minX = columns, maxX = -1, minY = grid.length / columns, maxY = -1;
        for (let i = 0; i < grid.length; i++) {
            if (grid[i]) {
                let x = i % columns;
                let y = Math.floor(i / columns);
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX === -1) return null; 

        let width = maxX - minX + 1;
        let height = maxY - minY + 1;

        for (let r of RECIPES) {
            let rWidth = r.pattern[0].length;
            let rHeight = r.pattern.length;
            
            if (width === rWidth && height === rHeight) {
                let match = true;
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        let gridItem = grid[(minY + y) * columns + (minX + x)];
                        let char = r.pattern[y][x];
                        
                        if (char === ' ') {
                            if (gridItem !== null) { match = false; break; }
                        } else {
                            let expectedId = r.ingredients[char];
                            if (!gridItem || gridItem.id !== expectedId) { match = false; break; }
                        }
                    }
                    if (!match) break;
                }
                if (match) return { id: r.result.id, count: r.result.count };
            }
        }
        return null;
    }

    handleOutputClick(e) {
        if (!this.outputSlot) return;
        
        if (this.cursorItem) {
            if (this.cursorItem.id !== this.outputSlot.id) return;
            if (this.cursorItem.count + this.outputSlot.count > 64) return;
        }

        if (this.cursorItem) this.cursorItem.count += this.outputSlot.count;
        else this.cursorItem = { ...this.outputSlot };

        let grid = this.currentCraftMode === '2x2' ? this.crafting2x2 : this.crafting3x3;
        for (let i = 0; i < grid.length; i++) {
            if (grid[i]) {
                grid[i].count--;
                if (grid[i].count <= 0) grid[i] = null;
            }
        }

        this.checkRecipes();
        this.updateUI();
    }

    updateUI() {
        this.renderGrid('hotbar', this.slots, 0, 9);
        this.renderGrid('player-inventory-hotbar', this.slots, 0, 9);
        this.renderGrid('player-inventory', this.slots, 9, 36);
        this.renderGrid('crafting-2x2', this.crafting2x2, 0, 4);
        this.renderGrid('crafting-3x3', this.crafting3x3, 0, 9);

        this.renderOutputSlot('crafting-2x2-output');
        this.renderOutputSlot('crafting-3x3-output');

        const draggedEl = document.getElementById('dragged-item');
        if (this.cursorItem) {
            draggedEl.innerHTML = this.getIconHTML(this.cursorItem);
            draggedEl.classList.remove('hidden');
        } else {
            draggedEl.innerHTML = '';
            draggedEl.classList.add('hidden');
        }
    }

    renderGrid(containerId, dataArray, start, end) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const domSlots = container.children;
        for (let i = 0; i < (end - start); i++) {
            const slotData = dataArray[start + i];
            const domSlot = domSlots[i];
            if (!domSlot) continue;
            
            if (slotData) domSlot.innerHTML = this.getIconHTML(slotData);
            else domSlot.innerHTML = '';

            if (containerId === 'hotbar') {
                if ((start + i) === this.selectedHotbarIndex) domSlot.classList.add('selected');
                else domSlot.classList.remove('selected');
            }
        }
    }

    renderOutputSlot(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (this.outputSlot) el.innerHTML = this.getIconHTML(this.outputSlot);
        else el.innerHTML = '';
    }

    getIconHTML(item) {
        let bgStyle = '';
        if (window.gameInstance && window.gameInstance.atlasCanvas) {
            let tileIndex = item.id - 1;
            if (item.id === 14) tileIndex = 13; // Для инвентаря показываем бок верстака
            
            const u = (tileIndex % 16) * 16;
            const v = Math.floor(tileIndex / 16) * 16;
            const bgUrl = window.gameInstance.atlasCanvas.toDataURL();
            bgStyle = `background-image: url(${bgUrl}); background-position: -${u}px -${v}px; background-size: 256px 256px;`;
        }
        return `<div class="item-icon" style="${bgStyle}"></div><span class="item-count">${item.count > 1 ? item.count : ''}</span>`;
    }

    openInventory() {
        this.isOpen = true;
        this.currentCraftMode = '2x2';
        document.getElementById('ui-overlay').classList.remove('hidden');
        document.getElementById('ui-top-player').classList.remove('hidden');
        document.getElementById('ui-top-workbench').classList.add('hidden');
        this.updateUI();
    }

    openWorkbench() {
        this.isOpen = true;
        this.currentCraftMode = '3x3';
        document.getElementById('ui-overlay').classList.remove('hidden');
        document.getElementById('ui-top-player').classList.add('hidden');
        document.getElementById('ui-top-workbench').classList.remove('hidden');
        this.updateUI();
    }

    closeUI() {
        this.isOpen = false;
        document.getElementById('ui-overlay').classList.add('hidden');
        
        this.returnItemsToInventory(this.crafting2x2);
        this.returnItemsToInventory(this.crafting3x3);
        if (this.cursorItem) {
            this.giveItem(this.cursorItem.id, this.cursorItem.count);
            this.cursorItem = null;
        }
        
        this.outputSlot = null;
        this.updateUI();
        document.body.requestPointerLock();
    }

    returnItemsToInventory(grid) {
        for (let i = 0; i < grid.length; i++) {
            if (grid[i]) {
                this.giveItem(grid[i].id, grid[i].count);
                grid[i] = null;
            }
        }
    }

    showDeathScreen() { document.getElementById('death-screen').classList.remove('hidden'); }
    hideDeathScreen() { document.getElementById('death-screen').classList.add('hidden'); }
}
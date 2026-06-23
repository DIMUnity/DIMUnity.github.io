const pokemonElement = document.querySelector('div.pokemon');

const localImages = [
  '皮卡丘.png',
  '小火龍.png',
  '傑尼龜.png',
  '妙蛙種子.png'
];

const pokemonDescriptions = {
  '皮卡丘': '雙頰有儲存電力的囊袋，生氣會釋放儲存的電力',
  '小火龍': '尾巴的火焰是生命力象徵，沒有活力火勢會變弱',
  '傑尼龜': '背部有堅硬甲殼，能從口中吐出強而有力的泡沫',
  '妙蛙種子': '在出生後，牠會吸收背上種子儲存著的營養成長'
};

const abilityEffects = [
  { name: '帶著餅乾磨蹭你，恭喜你獲得餅乾！', maxCount: 20, currentCount: 0 },
  { name: '領著你找到補給，恭喜你獲得飲料！', maxCount: 20, currentCount: 0 },
  { name: '掉出物品，恭喜你獲得免費用餐券！', maxCount: 20, currentCount: 0 },
  { name: '含著什麼，恭喜你獲得崇青資料夾！', maxCount: 20, currentCount: 0 }
];

function openModal() {
    document.getElementById('settingsModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

window.onclick = function(event) {
    if (event.target === document.getElementById('settingsModal')) {
        closeModal();
    }
}

function updateMaxCounts() {
    abilityEffects[0].maxCount = parseInt(document.getElementById('input-a').value, 10);
    abilityEffects[1].maxCount = parseInt(document.getElementById('input-b').value, 10);
    abilityEffects[2].maxCount = parseInt(document.getElementById('input-c').value, 10);
    abilityEffects[3].maxCount = parseInt(document.getElementById('input-d').value, 10);
    closeModal();
}

// 隨選獎項，回傳整張物件以便後續正確扣除庫存
const getRandomEffect = () => {
  const availableEffects = abilityEffects.filter(effect => effect.currentCount < effect.maxCount);
  if (availableEffects.length === 0) {
    return { name: '感覺有點疲憊，需要好好休息一下！', isFallback: true };
  }
  const randomIndex = Math.floor(Math.random() * availableEffects.length);
  return availableEffects[randomIndex];
};

const getPokemonDescription = (name) => {
  return pokemonDescriptions[name] || 'No description available.';
};

const createAbilities = (abilities) => 
  abilities.reduce((acc, item) => acc += `<li>${item}</li>`, '');

let lastIndex = -1;
const getRandomLocalImage = () => {
  let randomIndex;
  do {
    randomIndex = Math.floor(Math.random() * localImages.length);
  } while (randomIndex === lastIndex);
  lastIndex = randomIndex;
  return localImages[randomIndex];
};

const createPokemon = ({name, description, abilities}) => {
  const pokemonImage = `assets/pokemon_images/${name}.png`;
  pokemonElement.innerHTML = `
    <div class="pokemon__wrapperImage">
      <img src="${pokemonImage}" class="pokemon__image" alt="pokemon ${name}" />
    </div>
    <div class="pokemon__info">
      <h2 class="pokemon__name">${name}</h2>
      <p class="pokemon__description">${description}</p>
      <ul class="pokemon__abilities">
        ${createAbilities(abilities)}
      </ul>
    </div>
  `;
};

// 核心變數
let isSpinning = false;
let cooldown = false;

const startPokestopSpin = () => {
  if (isSpinning || cooldown) return; // 旋轉中或冷卻中不可再點

  isSpinning = true;
  const disc = document.getElementById('pokestopDisc');
  const pokemonDiv = document.querySelector('.pokemon');
  
  // 1. 啟動 3D 旋轉動畫，隱藏上一次的結果
  disc.classList.add('spinning');
  pokemonDiv.classList.remove('show');

  // 2. 轉動期間快速閃爍寶可夢剪影/圖片 (每 80 毫秒換一隻)
  let selectedEffectObj = null;
  const intervalId = setInterval(() => {
    const imageName = getRandomLocalImage().split('/').pop().split('.').shift();
    selectedEffectObj = getRandomEffect(); 
    
    const pokemonSelected = {
      name: imageName,
      description: getPokemonDescription(imageName),
      abilities: [imageName + selectedEffectObj.name]
    };
    createPokemon(pokemonSelected);
  }, 80);

  // 3. 2秒後自動停止旋轉並結算
  setTimeout(() => {
    clearInterval(intervalId);
    disc.classList.remove('spinning');
    isSpinning = false;
    
    // 扣除本次抽到的獎品庫存
    if (selectedEffectObj && !selectedEffectObj.isFallback) {
      selectedEffectObj.currentCount += 1;
    }

    // 顯示最終結果，補給站變成紫色冷卻狀態
    pokemonDiv.classList.add('show');
    disc.classList.add('cooldown');
    cooldown = true;

    // 5 秒後補給站冷卻結束（變回藍色，可再次旋轉）
    setTimeout(() => {
      disc.classList.remove('cooldown');
      cooldown = false;
    }, 5000);

  }, 2000); // 旋轉持續 2000 毫秒
};

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('pokestopDisc').addEventListener('click', startPokestopSpin);
});

const pokemonElement = document.querySelector('div.pokemon');

// Pokémon 圖片列表
const localImages = [
  '皮卡丘.png',
  '小火龍.png',
  '傑尼龜.png',
  '妙蛙種子.png'
];

// Pokémon 介紹
const pokemonDescriptions = {
  '皮卡丘': '雙頰有儲存電力的囊袋，生氣會釋放儲存的電力',
  '小火龍': '尾巴的火焰是生命力象徵，沒有活力火勢會變弱',
  '傑尼龜': '背部有堅硬甲殼，能從口中吐出強而有力的泡沫',
  '妙蛙種子': '在出生後，牠會吸收背上種子儲存著的營養成長'
};

// 技能效果(抽獎獎品)
const abilityEffects = [
  { name: '帶著餅乾磨蹭你，恭喜你獲得餅乾！', maxCount: 20, currentCount: 0 },
  { name: '領著你找到補給，恭喜你獲得飲料！', maxCount: 20, currentCount: 0 },
  { name: '掉出物品，恭喜你獲得免費用餐券！', maxCount: 20, currentCount: 0 },
  { name: '含著什麼，恭喜你獲得崇青資料夾！', maxCount: 20, currentCount: 0 }
];

// 打開模態視窗
function openModal() {
    document.getElementById('settingsModal').style.display = 'block';
}

// 關閉模態視窗
function closeModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

// 點擊視窗外部關閉模態視窗
window.onclick = function(event) {
    if (event.target === document.getElementById('settingsModal')) {
        closeModal();
    }
}

// 更新抽獎獎品的最大值
function updateMaxCounts() {
    abilityEffects[0].maxCount = parseInt(document.getElementById('input-a').value, 10);
    abilityEffects[1].maxCount = parseInt(document.getElementById('input-b').value, 10);
    abilityEffects[2].maxCount = parseInt(document.getElementById('input-c').value, 10);
    abilityEffects[3].maxCount = parseInt(document.getElementById('input-d').value, 10);

    closeModal();
}

// 獲取隨機的技能效果(抽獎獎品)
const getRandomEffect = () => {
  const availableEffects = abilityEffects.filter(effect => effect.currentCount < effect.maxCount);
  if (availableEffects.length === 0) {
    return '感覺有點疲憊，需要好好休息一下！';
  }
  const randomIndex = Math.floor(Math.random() * availableEffects.length);
  const selectedEffect = availableEffects[randomIndex];
  selectedEffect.currentCount += 1;
  return selectedEffect.name;
};

// 獲取 Pokémon 的介紹
const getPokemonDescription = (name) => {
  return pokemonDescriptions[name] || 'No description available.';
};

// 創建 HTML 列表項
const createAbilities = (abilities) => 
  abilities.reduce((acc, item) => acc += `<li>${item}</li>`, '');

// 儲存上一次的圖片索引
let lastIndex = -1;

// 獲取隨機的 Pokémon
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
      <img 
        src="${pokemonImage}" 
        class="pokemon__image" 
        alt="pokemon ${name}"
      />
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

// 獲取寶可夢
const getPokemon = () => {
  const pokemonDiv = document.querySelector('.pokemon');
  pokemonDiv.classList.add('show');
  const imageName = getRandomLocalImage().split('.').shift();
  const pokemonName = imageName;
  const pokemonDescription = getPokemonDescription(pokemonName);
  const randomAbilityEffect = imageName + getRandomEffect();

  const pokemonSelected = {
    name: pokemonName,
    description: pokemonDescription,
    abilities: [randomAbilityEffect]
  };
  createPokemon(pokemonSelected);
};

// 初始化事件監聽器
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('pokebola').addEventListener('click', getPokemon);
});
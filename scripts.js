const pokemonElement = document.querySelector('div.pokemon');

// Pokémon image list
const localImages = [
  '皮卡丘.png',
  '小火龍.png',
  '傑尼龜.png',
  '妙蛙種子.png'
];

// Pokémon descriptions
const pokemonDescriptions = {
  '皮卡丘': '雙頰有儲存電力的囊袋，生氣會釋放儲存的電力',
  '小火龍': '尾巴的火焰是生命力象徵，沒有活力火勢會變弱',
  '傑尼龜': '背部有堅硬甲殼，能從口中吐出強而有力的泡沫',
  '妙蛙種子': '在出生後，牠會吸收背上種子儲存著的營養成長'
};

// Ability effects (Lottery prize)
const abilityEffects = [
  { name: '帶著餅乾磨蹭你，恭喜你獲得餅乾！', maxCount: 20, currentCount: 0 },
  { name: '領著你找到補給，恭喜你獲得飲料！', maxCount: 20, currentCount: 0 },
  { name: '掉出物品，恭喜你獲得免費用餐券！', maxCount: 20, currentCount: 0 },
  { name: '含著什麼，恭喜你獲得崇青資料夾！', maxCount: 20, currentCount: 0 }
];

// Open the modal window
function openModal() {
    document.getElementById('settingsModal').style.display = 'block';
}

// Close the modal window
function closeModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

// Close the modal window by clicking outside of it
window.onclick = function(event) {
    if (event.target === document.getElementById('settingsModal')) {
        closeModal();
    }
}

// Update the maximum value of the ability effect
function updateMaxCounts() {
    abilityEffects[0].maxCount = parseInt(document.getElementById('input-a').value, 10);
    abilityEffects[1].maxCount = parseInt(document.getElementById('input-b').value, 10);
    abilityEffects[2].maxCount = parseInt(document.getElementById('input-c').value, 10);
    abilityEffects[3].maxCount = parseInt(document.getElementById('input-d').value, 10);

    closeModal();
}

// Get random ability effect
const getRandomEffect = () => {
  const availableEffects = abilityEffects.filter(effect => effect.currentCount < effect.maxCount);
  if (availableEffects.length === 0) {
    return '感覺有點疲憊，需要好好休息一下！';
  }
  const randomIndex = Math.floor(Math.random() * availableEffects.length);
  const selectedEffect = availableEffects[randomIndex];
  return selectedEffect.name;
};

// Get Pokémon description
const getPokemonDescription = (name) => {
  return pokemonDescriptions[name] || 'No description available.';
};

// Create abilities list
const createAbilities = (abilities) => 
  abilities.reduce((acc, item) => acc += `<li>${item}</li>`, '');

// Get a random Pokémon image
let lastIndex = -1;
const getRandomLocalImage = () => {
  let randomIndex;
  do {
    randomIndex = Math.floor(Math.random() * localImages.length);
  } while (randomIndex === lastIndex);
  lastIndex = randomIndex;
  return localImages[randomIndex];
};

// Create Pokemon element
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

let intervalId = null;  // Store setInterval ID
let isCycling = false;  // Track the cycling state
let currentPokemon = null;  // Track the current Pokemon being displayed

// Start or stop Pokemon switching based on current state
const togglePokemonCycle = () => {
  if (isCycling) {
    // Stop the cycle
    clearInterval(intervalId);
    intervalId = null;
    isCycling = false;
    
    // Decrease effect count for the current Pokemon's effect when stopping
    if (currentPokemon) {
      const effectName = currentPokemon.abilities[0];
      if (effectName !== 'error') {
        const effectIndex = abilityEffects.findIndex(e => e.name === effectName);
        if (effectIndex !== -1) {
          abilityEffects[effectIndex].currentCount += 1;
        }
      }
    }
  } else {
    // Start the cycle
    const pokemonDiv = document.querySelector('.pokemon');
    pokemonDiv.classList.add('show');  // Show the Pokemon container

    intervalId = setInterval(() => {
      getPokemon();
    }, 100); // Change every 1 second
    isCycling = true;
  }
};

// Get Pokemon and display it
const getPokemon = () => {
  const imageName = getRandomLocalImage().split('/').pop().split('.').shift();
  const pokemonName = imageName;
  const pokemonDescription = getPokemonDescription(pokemonName);
  const randomAbilityEffect = getRandomEffect();

  const pokemonSelected = {
    name: pokemonName,
    description: pokemonDescription,
    abilities: [randomAbilityEffect]
  };
  createPokemon(pokemonSelected);
  currentPokemon = pokemonSelected;  // Update the current Pokemon
};

// Attach event listener to the Pokebola
document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.pokebola__image').addEventListener('click', togglePokemonCycle);
});
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  writeBatch, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  updateProfile, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── 🌓 自動切換深淺色 App Icon ───
function updateAppIcon() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const iconEl = document.getElementById('apple-icon');
  if (iconEl) {
    iconEl.href = isDark ? './icon-dark.png' : './icon-light.png';
  }
}
updateAppIcon();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateAppIcon);

// ─── 系統常數與 Firebase 初始化設定 ───
const SUPER_ADMIN_EMAIL = "tp6u4jo6@gmail.com";

const firebaseConfig = {
  apiKey: "AIzaSyCI9IfeQEa37kdx5ZSqtFvpsm9z3oa9n-Y",
  authDomain: "hsinchu-veg-map.firebaseapp.com",
  projectId: "hsinchu-veg-map",
  storageBucket: "hsinchu-veg-map.firebasestorage.app",
  messagingSenderId: "229294662793",
  appId: "1:229294662793:web:d467459c29f46eb0aed258"
};

let db = null;
let auth = null;
let googleProvider = null;
let storesCollection = null;
let isFirebaseReady = false;
let currentUser = null;
let unsubscribeFirestore = null;
let sortableInstance = null;

let allMembersList = [];
let userProfilesMap = {};
let viewingTargetEmail = "mine";
let pendingAvatarBase64 = null;
let pendingDeleteStoreId = null;

let routingControl = null;
let isNavigating = false;
let isActiveNavigationMode = false;
let activeNavStoreId = null;
let currentRouteMode = 'moto';
let userCurrentLocation = null;
let navGeoWatcherId = null;
let navUserMarker = null;
let currentRouteData = null;
let isNavMuted = false;
let currentHeadingDeg = 0;

const geocodeCache = new Map();

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userCurrentLocation = [pos.coords.latitude, pos.coords.longitude];
    },
    () => {},
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    storesCollection = collection(db, "vegan_stores");
    isFirebaseReady = true;

    onAuthStateChanged(auth, async (user) => {
      const lockScreen = document.getElementById('auth-lock-screen');
      const loadingScreen = document.getElementById('app-loading-screen');

      if (user) {
        const userEmail = (user.email || "").toLowerCase().trim();
        let isAuthorized = false;

        loadingScreen.classList.remove('fade-out');
        loadingScreen.classList.add('active');
        lockScreen.style.display = 'none';

        if (userEmail === SUPER_ADMIN_EMAIL.toLowerCase()) {
          isAuthorized = true;
        } else {
          try {
            const memberDoc = await getDoc(doc(db, "whitelist_users", userEmail));
            if (memberDoc.exists()) {
              isAuthorized = true;
            }
          } catch (err) {
            console.error("讀取白名單失敗:", err);
          }
        }

        if (!isAuthorized) {
          loadingScreen.classList.remove('active');
          alert(`⛔ 存取被拒絕！\n\n帳號【${user.email}】尚未取得訪問授權。\n請聯繫管理員為您開啟權限。`);
          currentUser = null;
          await signOut(auth);
          lockScreen.style.display = 'flex';
          return;
        }

        currentUser = user;

        const adminWhitelistBtn = document.getElementById('btn-open-whitelist');
        if (adminWhitelistBtn) {
          adminWhitelistBtn.style.display = (userEmail === SUPER_ADMIN_EMAIL.toLowerCase()) ? 'flex' : 'none';
        }

        const profilePromise = loadUserProfile(userEmail);
        const membersPromise = loadAllMembers();

        const initialStoresPromise = new Promise((resolve) => {
          let resolved = false;
          if (unsubscribeFirestore) {
            unsubscribeFirestore();
            unsubscribeFirestore = null;
          }
          unsubscribeFirestore = onSnapshot(storesCollection, (snapshot) => {
            stores = snapshot.docs.map(d => {
              const data = d.data();
              let visitedBy = Array.isArray(data.visitedBy) 
                ? [...data.visitedBy] 
                : (data.visited ? [SUPER_ADMIN_EMAIL.toLowerCase()] : []);

              return {
                id: d.id,
                ...data,
                visitedBy
              };
            }).sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));
            
            refreshAll();

            if (!resolved) {
              resolved = true;
              resolve();
            }
          }, (err) => {
            console.error("Firestore 錯誤:", err);
            if (!resolved) {
              resolved = true;
              resolve();
            }
          });
        });

        await Promise.all([profilePromise, membersPromise, initialStoresPromise]);

        setTimeout(() => {
          map.invalidateSize();
        }, 150);

        setTimeout(() => {
          loadingScreen.classList.add('fade-out');
          setTimeout(() => {
            loadingScreen.classList.remove('active');
          }, 400);
        }, 350);

      } else {
        currentUser = null;
        loadingScreen.classList.remove('active');
        lockScreen.style.display = 'flex';
        stores = [];
        if (unsubscribeFirestore) {
          unsubscribeFirestore();
          unsubscribeFirestore = null;
        }
        refreshAll();
      }
    });

  } catch (err) {
    console.warn("Firebase 初始化失敗", err);
  }
}

let stores = [];

async function loadUserProfile(userEmail) {
  try {
    const profileDoc = await getDoc(doc(db, "user_profiles", userEmail));
    let data = {};
    if (profileDoc.exists()) {
      data = profileDoc.data();
      userProfilesMap[userEmail] = data;
    }

    const displayName = data.displayName || currentUser.displayName || 'OneDimMan';
    const bio = data.bio || '好好吃~';
    const photo = data.photoURL || currentUser.photoURL || '';

    document.getElementById('menu-user-name').innerText = displayName;
    document.getElementById('menu-user-bio').innerText = bio;
    document.getElementById('menu-user-email').innerText = userEmail;

    updateAvatarElements(photo);
  } catch (e) {
    console.error("讀取個人檔案失敗", e);
  }
}

function updateAvatarElements(photoURL) {
  const avatarSyncEls = document.querySelectorAll('.user-avatar-sync');
  avatarSyncEls.forEach(el => {
    if (photoURL) {
      el.innerHTML = `<img src="${photoURL}" alt="avatar" />`;
    } else {
      el.innerText = '🌱';
    }
  });
}

async function loadAllMembers() {
  try {
    const snap = await getDocs(collection(db, "whitelist_users"));
    const set = new Set([SUPER_ADMIN_EMAIL.toLowerCase()]);
    snap.forEach(d => set.add(d.id.toLowerCase()));
    allMembersList = Array.from(set);

    const profilesSnap = await getDocs(collection(db, "user_profiles"));
    profilesSnap.forEach(d => {
      userProfilesMap[d.id.toLowerCase()] = d.data();
    });

    updateDockCapsuleUI();
  } catch (e) {
    console.error("載入成員清單失敗", e);
  }
}

function getMemberDisplayName(email) {
  const p = userProfilesMap[email.toLowerCase()];
  if (p && p.displayName) return p.displayName;
  return email.split('@')[0];
}

function getMemberBio(email) {
  const p = userProfilesMap[email.toLowerCase()];
  return (p && p.bio) ? p.bio : '';
}

function getMemberPhoto(email) {
  const p = userProfilesMap[email.toLowerCase()];
  return (p && p.photoURL) ? p.photoURL : '';
}

function getActiveViewEmail() {
  if (!currentUser) return "";
  return viewingTargetEmail === "mine" ? currentUser.email.toLowerCase() : viewingTargetEmail.toLowerCase();
}

function isStoreUnlockedForCurrentView(store) {
  const email = getActiveViewEmail();
  return Array.isArray(store.visitedBy) && store.visitedBy.includes(email);
}

window.changeViewingTarget = function(val) {
  viewingTargetEmail = val;
  refreshAll();
};

window.selectViewTarget = function(targetEmail) {
  changeViewingTarget(targetEmail);
  document.getElementById('ig-dock-container')?.classList.remove('active');
};

function updateDockCapsuleUI() {
  const container = document.getElementById('dock-friend-list-items');
  const stack = document.getElementById('dock-avatar-stack');
  const title = document.getElementById('dock-current-view-title');
  if (!container || !stack || !currentUser) return;

  const myEmail = currentUser.email.toLowerCase();
  const currentView = getActiveViewEmail();

  if (viewingTargetEmail === "mine" || currentView === myEmail) {
    title.innerText = "我的星圖";
  } else {
    title.innerText = `${getMemberDisplayName(currentView)} 的星圖`;
  }

  let stackHtml = '';
  allMembersList.slice(0, 3).forEach((m, idx) => {
    const photo = getMemberPhoto(m);
    const name = getMemberDisplayName(m);
    const initial = name[0].toUpperCase();
    if (photo) {
      stackHtml += `<div class="dock-stack-avatar"><img src="${photo}" /></div>`;
    } else {
      const colors = ['#10b981', '#06b6d4', '#8b5cf6', '#ec4899'];
      const bg = colors[idx % colors.length];
      stackHtml += `<div class="dock-stack-avatar" style="background: ${bg};">${initial}</div>`;
    }
  });
  stack.innerHTML = stackHtml;

  const totalStores = stores.length;
  const memberStats = allMembersList.map(email => {
    const visitedCount = stores.filter(s => Array.isArray(s.visitedBy) && s.visitedBy.includes(email)).length;
    const pct = totalStores > 0 ? Math.round((visitedCount / totalStores) * 100) : 0;
    return {
      email,
      displayName: getMemberDisplayName(email),
      bio: getMemberBio(email),
      photo: getMemberPhoto(email),
      visitedCount,
      pct
    };
  });

  memberStats.sort((a, b) => b.visitedCount - a.visitedCount);

  let listHtml = '';
  memberStats.forEach(({ email, displayName, bio, photo, visitedCount, pct }, idx) => {
    const isMe = email === myEmail;
    const isTarget = (viewingTargetEmail === 'mine' && isMe) || (currentView === email);
    const initial = displayName[0].toUpperCase();
    const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : '✨'));

    listHtml += `
      <div class="dock-friend-item ${isTarget ? 'active' : ''}" onclick="selectViewTarget('${isMe ? 'mine' : email}')">
        <div class="dock-friend-avatar">
          <div class="dock-friend-avatar-inner">
            ${photo ? `<img src="${photo}" />` : initial}
          </div>
          <span class="dock-rank-badge">${medal}</span>
        </div>
        <div class="dock-friend-info">
          <div class="dock-friend-name">${displayName} ${isMe ? '(我)' : ''}</div>
          ${bio ? `<div class="dock-friend-bio">${bio}</div>` : ''}
          <div class="dock-friend-stat">❤️ ${visitedCount}/${totalStores} (${pct}%)</div>
        </div>
        <div class="dock-friend-active-dot"></div>
      </div>
    `;
  });

  container.innerHTML = listHtml;
}

window.openProfileEditModal = function() {
  closeUserMenu();
  const myEmail = currentUser.email.toLowerCase();
  const profile = userProfilesMap[myEmail] || {};

  document.getElementById('edit-profile-name').value = profile.displayName || currentUser.displayName || 'OneDimMan';
  document.getElementById('edit-profile-username').value = profile.username || myEmail.split('@')[0];
  document.getElementById('edit-profile-bio').value = profile.bio || '好好吃~';

  pendingAvatarBase64 = profile.photoURL || currentUser.photoURL || null;
  updateAvatarElements(pendingAvatarBase64);

  document.getElementById('profile-edit-modal').classList.add('active');
};

window.closeProfileEditModal = function() {
  document.getElementById('profile-edit-modal').classList.remove('active');
};

window.handleAvatarFileSelect = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const maxDim = 96;
      let w = img.width, h = img.height;
      if (w > h) {
        if (w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
      } else {
        if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      pendingAvatarBase64 = canvas.toDataURL('image/webp', 0.65);
      updateAvatarElements(pendingAvatarBase64);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
};

window.saveUserProfile = async function() {
  if (!currentUser) return;
  const myEmail = currentUser.email.toLowerCase();

  const newName = document.getElementById('edit-profile-name').value.trim() || 'OneDimMan';
  const newUsername = document.getElementById('edit-profile-username').value.trim();
  const newBio = document.getElementById('edit-profile-bio').value.trim();

  const btn = document.getElementById('btn-save-profile');
  btn.innerText = '儲存中...';
  btn.disabled = true;

  try {
    const updateData = {
      displayName: newName,
      username: newUsername,
      bio: newBio,
      updatedAt: serverTimestamp ? serverTimestamp() : Date.now()
    };

    if (pendingAvatarBase64) {
      updateData.photoURL = pendingAvatarBase64;
    }

    await setDoc(doc(db, "user_profiles", myEmail), updateData, { merge: true });

    try {
      await updateProfile(currentUser, { 
        displayName: newName,
        ...(pendingAvatarBase64 ? { photoURL: pendingAvatarBase64 } : {})
      });
    } catch (e) {}

    userProfilesMap[myEmail] = {
      ...userProfilesMap[myEmail],
      ...updateData
    };

    document.getElementById('menu-user-name').innerText = newName;
    document.getElementById('menu-user-bio').innerText = newBio || '尚未填寫個人介紹';

    updateAvatarElements(pendingAvatarBase64);
    closeProfileEditModal();
    refreshAll();
  } catch (err) {
    alert(`更新失敗：${err.message}`);
  } finally {
    btn.innerText = '完成';
    btn.disabled = false;
  }
};

window.openWhitelistModal = async function() {
  closeUserMenu();
  document.getElementById('whitelist-modal').classList.add('active');
  await renderWhitelistMembers();
};

window.closeWhitelistModal = function() {
  document.getElementById('whitelist-modal').classList.remove('active');
};

async function renderWhitelistMembers() {
  const box = document.getElementById('whitelist-members-box');
  box.innerHTML = '<div style="color: #888; font-size: 12px; text-align: center; padding: 10px;">讀取成員名單中...</div>';

  try {
    await loadAllMembers();

    let html = '';
    const myEmail = currentUser.email.toLowerCase();
    const isSuperAdmin = myEmail === SUPER_ADMIN_EMAIL.toLowerCase();

    allMembersList.forEach(email => {
      const isOwner = email === SUPER_ADMIN_EMAIL.toLowerCase();
      const displayName = getMemberDisplayName(email);

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#1c1c1e; padding:9px 12px; border-radius:10px; font-size:12.5px; border:1px solid #27272a;">
          <div style="display:flex; flex-direction:column; overflow:hidden;">
            <span style="font-weight:700; color:#fff;">${displayName}</span>
            <span style="font-size:11px; color:#a1a1aa;">${email}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${isOwner ? '<span style="font-size:10px; background:#333; color:#a1a1aa; padding:2px 6px; border-radius:6px;">創始擁有者</span>' : ''}
            ${(isSuperAdmin && !isOwner) ? `<button onclick="removeWhitelistMember('${email}')" style="background:transparent; border:none; color:#ff453a; cursor:pointer; font-weight:700; font-size:12px;">移除授權</button>` : ''}
          </div>
        </div>
      `;
    });

    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = '<div style="color: #ff453a; font-size: 12px; text-align: center; padding: 10px;">讀取名單失敗</div>';
  }
}

window.addWhitelistMember = async function() {
  const input = document.getElementById('new-whitelist-email');
  const email = input.value.trim().toLowerCase();
  
  if (!email || !email.includes('@')) {
    return alert('請輸入正確的 Email 地址！');
  }
  if (email === SUPER_ADMIN_EMAIL.toLowerCase()) {
    return alert('該帳號已經是創始管理員！');
  }

  try {
    await setDoc(doc(db, "whitelist_users", email), {
      addedAt: serverTimestamp ? serverTimestamp() : Date.now(),
      addedBy: currentUser.email
    });
    input.value = '';
    await renderWhitelistMembers();
  } catch (e) {
    alert(`新增授權成員失敗：${e.message}`);
  }
};

window.removeWhitelistMember = async function(email) {
  if (!confirm(`確定要取消【${email}】的授權訪問嗎？`)) return;
  try {
    await deleteDoc(doc(db, "whitelist_users", email));
    await renderWhitelistMembers();
  } catch (e) {
    alert(`移除失敗：${e.message}`);
  }
};

// ─── Leaflet 地圖初始化與圖層設定 ───
const map = L.map('map', { center: [24.805, 120.975], zoom: 13, zoomControl: false });

const layers = {
  taiwan: L.tileLayer('https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}', { maxZoom: 19 }),
  dark: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }),
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 })
};

let currentBaseLayer = layers.taiwan;
currentBaseLayer.addTo(map);

function updateLayerBoxState(mainType) {
  const labelText = document.getElementById('layer-box-text');
  const iconPreview = document.getElementById('layer-box-preview-icon');
  if (mainType === 'satellite') {
    if (labelText) labelText.innerText = '地圖';
    if (iconPreview) iconPreview.innerText = '🗺️';
  } else {
    if (labelText) labelText.innerText = '衛星';
    if (iconPreview) iconPreview.innerText = '🛰️';
  }
}

window.switchBaseLayer = function(type, el, isDirectClick = false) {
  if (layers[type]) {
    map.removeLayer(currentBaseLayer);
    currentBaseLayer = layers[type];
    currentBaseLayer.addTo(map);

    document.querySelectorAll('.layer-thumb-item').forEach(btn => btn.classList.remove('active'));
    if (el) el.classList.add('active');

    updateLayerBoxState(type);

    if (isDirectClick && window.innerWidth <= 768) {
      const picker = document.getElementById('layer-picker-horizontal');
      if (picker) picker.classList.remove('active');
    }
  }
};

window.handleLayerBoxClick = function() {
  const picker = document.getElementById('layer-picker-horizontal');
  if (window.innerWidth <= 768 && picker) {
    picker.classList.toggle('active');
  }

  if (currentBaseLayer === layers.satellite) {
    const defaultItem = document.querySelector('.layer-thumb-item:nth-child(1)');
    switchBaseLayer('taiwan', defaultItem);
  } else {
    const satItem = document.querySelector('.layer-thumb-item:nth-child(2)');
    switchBaseLayer('satellite', satItem);
  }
};

const constellationLayer = L.layerGroup().addTo(map);
const markersLayer = L.layerGroup().addTo(map);
const markersRef = {};

function calculateRank(visitedCount, total) {
  if (total === 0 || visitedCount === 0) return '🌱 蔬食初探者';
  const pct = Math.round((visitedCount / total) * 100);
  if (pct === 100) return '👑 蔬食星域主宰';
  if (pct >= 80 || visitedCount >= 15) return '🌟 蔬食星圖領航星';
  if (pct >= 60 || visitedCount >= 10) return '✨ 綠光導航員';
  if (pct >= 40 || visitedCount >= 6) return '🍃 植感生活達人';
  if (pct >= 20 || visitedCount >= 3) return '🌿 巷弄綠食行者';
  return '🌱 蔬食初探者';
}

function getCategoryIcon(category) {
  if (!category) return '🌱';
  if (category.includes('蛋奶素')) return '🍳';
  if (category.includes('純素') || category.includes('全素')) return '🌱';
  if (category.includes('早午餐')) return '🥪';
  if (category.includes('甜點')) return '🍰';
  if (category.includes('異國')) return '🍕';
  return '🌱';
}

window.flyToWithOffset = function(lat, lng, zoom = 16.5) {
  if (window.innerWidth <= 768) {
    const topBarHeight = 135;
    const bottomCardHeight = 180;
    const visibleCenterY = topBarHeight + (window.innerHeight - topBarHeight - bottomCardHeight) / 2;
    const screenCenterY = window.innerHeight / 2;
    const offsetY = visibleCenterY - screenCenterY;

    const targetPoint = map.project([lat, lng], zoom);
    const offsetPoint = L.point(targetPoint.x, targetPoint.y - offsetY);
    const targetLatLng = map.unproject(offsetPoint, zoom);
    map.flyTo(targetLatLng, zoom, { duration: 0.6 });
  } else {
    map.flyTo([lat, lng], zoom, { duration: 0.6 });
  }
};

let selectedStoreId = null;

function getRouterConfig(mode) {
  if (mode === 'foot') {
    return {
      router: L.Routing.osrmv1({
        serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1',
        profile: 'driving'
      }),
      styles: [
        { color: '#8b5cf6', opacity: 0.45, weight: 8 },
        { color: '#ec4899', opacity: 0.95, weight: 5, dashArray: '5, 8' }
      ]
    };
  } else if (mode === 'moto') {
    return {
      router: L.Routing.osrmv1({
        serviceUrl: 'https://routing.openstreetmap.de/routed-bike/route/v1',
        profile: 'driving'
      }),
      styles: [
        { color: '#06b6d4', opacity: 0.45, weight: 8 },
        { color: '#10b981', opacity: 0.95, weight: 5 }
      ]
    };
  } else {
    return {
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        profile: 'car'
      }),
      styles: [
        { color: '#0284c7', opacity: 0.45, weight: 8 },
        { color: '#38bdf8', opacity: 0.95, weight: 5 }
      ]
    };
  }
}

window.planRouteToStore = function(storeId, mode = currentRouteMode) {
  const store = stores.find(s => s.id === storeId);
  if (!store) return;

  activeNavStoreId = storeId;
  currentRouteMode = mode;
  isNavigating = true;

  constellationLayer.clearLayers();
  renderMarkers(getFilteredStores());

  if (routingControl) {
    try { map.removeControl(routingControl); } catch (e) {}
    routingControl = null;
  }

  closeDetailSheet();

  ['car', 'moto', 'foot'].forEach(m => {
    const btn = document.getElementById(`btn-mode-${m}`);
    if (btn) btn.classList.toggle('active', m === mode);
  });

  const previewEl = document.getElementById('route-summary-preview');
  if (previewEl) {
    previewEl.style.display = 'inline-flex';
    document.getElementById('preview-nav-time').innerText = '計算路線中...';
    document.getElementById('preview-nav-meta').innerText = '';
  }

  const startCoord = userCurrentLocation || [24.805, 120.975];
  const waypoints = [
    L.latLng(startCoord[0], startCoord[1]),
    L.latLng(store.lat, store.lng)
  ];

  const cfg = getRouterConfig(mode);

  routingControl = L.Routing.control({
    waypoints: waypoints,
    router: cfg.router,
    lineOptions: { 
      styles: cfg.styles,
      extendToWaypoints: true,
      missingRouteStyles: [{ color: '#71717a', opacity: 0.5, weight: 4 }]
    },
    altLineOptions: { 
      styles: [
        { color: '#52525b', opacity: 0.6, weight: 6 },
        { color: '#a1a1aa', opacity: 0.8, weight: 3, dashArray: '4, 6' }
      ]
    },
    showAlternatives: true,
    createMarker: function() { return null; },
    addWaypoints: false,
    fitSelectedRoutes: true
  }).addTo(map);
  
  routingControl.on('routeselected', function(e) {
    currentRouteData = e.route;
    updateNavDataDisplay(currentRouteData);
  });

  routingControl.on('routingerror', function() {
    if (previewEl) {
      document.getElementById('preview-nav-time').innerText = '導航伺服器忙碌';
      document.getElementById('preview-nav-meta').innerText = '請稍候重試';
    }
  });

  const bar = document.getElementById('route-indicator-bar');
  if (bar) bar.style.display = 'flex';
};

window.switchRouteMode = function(mode) {
  if (!activeNavStoreId) return;
  planRouteToStore(activeNavStoreId, mode);
};

window.startActiveNavigation = async function() {
  if (!activeNavStoreId || !currentRouteData) return;

  isActiveNavigationMode = true;
  setupOrientationSensors();

  document.getElementById('route-indicator-bar').style.display = 'none';
  document.getElementById('mobile-floating-top').style.display = 'none';
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('ig-dock-container').style.display = 'none';
  document.querySelector('.gmaps-layer-dock').style.display = 'none';

  document.getElementById('nav-top-banner').style.display = 'flex';
  document.getElementById('nav-right-controls').style.display = 'flex';
  document.getElementById('nav-bottom-card').style.display = 'flex';

  const mapEl = document.getElementById('map');
  mapEl.classList.add('nav-rotator-mode');
  map.invalidateSize();

  const startCoord = userCurrentLocation || [24.805, 120.975];
  if (!navUserMarker) {
    const iconHtml = `
      <div class="nav-user-heading-cone">
        <div class="radar-pulse-ring"></div>
        <div class="nav-user-heading-pointer"></div>
        <div class="nav-user-circle"></div>
      </div>
    `;
    navUserMarker = L.marker(startCoord, {
      icon: L.divIcon({ html: iconHtml, className: '', iconSize: [48, 48], iconAnchor: [24, 24] }),
      zIndexOffset: 2000
    }).addTo(map);
  } else {
    navUserMarker.setLatLng(startCoord);
  }

  map.setView(startCoord, 18, { animate: true });

  if (navigator.geolocation) {
    navGeoWatcherId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const heading = pos.coords.heading;
        userCurrentLocation = [lat, lng];

        if (navUserMarker) {
          navUserMarker.setLatLng([lat, lng]);
        }

        if (isActiveNavigationMode) {
          map.panTo([lat, lng], { animate: true });
          if (heading !== null && heading !== undefined && !isNaN(heading)) {
            applyMapRotation(heading);
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
  }
};

function setupOrientationSensors() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === 'granted') {
          window.addEventListener('deviceorientation', handleOrientationEvent, true);
        }
      })
      .catch(() => {});
  } else {
    window.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
    window.addEventListener('deviceorientation', handleOrientationEvent, true);
  }
}

function handleOrientationEvent(e) {
  if (!isActiveNavigationMode) return;
  let heading = null;

  if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
    heading = e.webkitCompassHeading;
  } else if (e.alpha !== null && e.alpha !== undefined) {
    heading = 360 - e.alpha;
  }

  if (heading !== null && !isNaN(heading)) {
    if (Math.abs(heading - currentHeadingDeg) > 1.5) {
      applyMapRotation(heading);
    }
  }
}

function applyMapRotation(headingDeg) {
  currentHeadingDeg = headingDeg;
  const mapEl = document.getElementById('map');
  if (mapEl && isActiveNavigationMode) {
    mapEl.style.transform = `rotate(${-headingDeg}deg)`;
  }

  const compassBtn = document.getElementById('btn-nav-compass');
  if (compassBtn) {
    compassBtn.style.transform = `rotate(${-headingDeg}deg)`;
  }
}

function updateNavDataDisplay(route) {
  if (!route) return;

  const totalDistMeters = route.summary.totalDistance;
  const totalSecs = route.summary.totalTime;

  const minutes = Math.max(1, Math.round(totalSecs / 60));
  const distKm = (totalDistMeters / 1000).toFixed(1);
  
  const etaDate = new Date(Date.now() + totalSecs * 1000);
  const hours = etaDate.getHours();
  const period = hours >= 12 ? '下午' : '上午';
  const h12 = hours % 12 || 12;
  const mStr = etaDate.getMinutes().toString().padStart(2, '0');
  const etaFormatted = `${period} ${h12}:${mStr}`;

  document.getElementById('nav-summary-time').innerText = `${minutes} 分鐘`;
  document.getElementById('nav-summary-meta').innerText = `${distKm} 公里 · 預計 ${etaFormatted} 抵達`;

  const previewEl = document.getElementById('route-summary-preview');
  const previewTime = document.getElementById('preview-nav-time');
  const previewMeta = document.getElementById('preview-nav-meta');
  if (previewEl && previewTime && previewMeta) {
    previewTime.innerText = `${minutes} 分鐘`;
    previewMeta.innerText = `· ${distKm} 公里 · 預計 ${etaFormatted} 抵達`;
    previewEl.style.display = 'inline-flex';
  }

  const instructions = route.instructions || [];
  if (instructions.length > 0) {
    const first = instructions[0];
    const distStr = first.distance > 1000 ? `${(first.distance / 1000).toFixed(1)}公里後` : `${Math.round(first.distance)} 公尺後`;
    document.getElementById('nav-maneuver-dist').innerText = distStr;
    document.getElementById('nav-maneuver-main').innerText = parseTurnText(first.text || '往東前進');
    document.getElementById('nav-maneuver-icon').innerText = getTurnArrow(first.type, first.modifier);
  }

  if (instructions.length > 1) {
    const second = instructions[1];
    document.getElementById('nav-next-step-chip').style.display = 'inline-flex';
    document.getElementById('nav-next-arrow').innerText = getTurnArrow(second.type, second.modifier);
  } else {
    document.getElementById('nav-next-step-chip').style.display = 'none';
  }
}

function parseTurnText(text) {
  if (!text) return '繼續前進';
  if (text.includes('Head') || text.includes('straight')) return '繼續直行';
  if (text.includes('left')) return '向左轉';
  if (text.includes('right')) return '向右轉';
  if (text.includes('destination')) return '即將抵達目的地';
  return text;
}

function getTurnArrow(type, modifier) {
  if (modifier && modifier.includes('left')) return '↰';
  if (modifier && modifier.includes('right')) return '↱';
  if (type && type.includes('Destination')) return '🏁';
  return '↑';
}

window.exitActiveNavigation = function() {
  isActiveNavigationMode = false;

  window.removeEventListener('deviceorientation', handleOrientationEvent, true);
  window.removeEventListener('deviceorientationabsolute', handleOrientationEvent, true);

  if (navGeoWatcherId !== null) {
    navigator.geolocation.clearWatch(navGeoWatcherId);
    navGeoWatcherId = null;
  }
  if (navUserMarker) {
    map.removeLayer(navUserMarker);
    navUserMarker = null;
  }

  const mapEl = document.getElementById('map');
  mapEl.classList.remove('nav-rotator-mode');
  mapEl.style.transform = '';
  const compassBtn = document.getElementById('btn-nav-compass');
  if (compassBtn) compassBtn.style.transform = '';

  map.invalidateSize();

  document.getElementById('nav-top-banner').style.display = 'none';
  document.getElementById('nav-right-controls').style.display = 'none';
  document.getElementById('nav-bottom-card').style.display = 'none';

  document.getElementById('sidebar').style.display = 'flex';
  document.getElementById('ig-dock-container').style.display = 'flex';
  document.querySelector('.gmaps-layer-dock').style.display = 'flex';
  if (window.innerWidth <= 768) {
    document.getElementById('mobile-floating-top').style.display = 'flex';
  }

  clearRoute();
};

window.clearRoute = function() {
  if (routingControl) {
    try { map.removeControl(routingControl); } catch (e) {}
    routingControl = null;
  }
  isNavigating = false;
  activeNavStoreId = null;
  currentRouteData = null;
  const bar = document.getElementById('route-indicator-bar');
  if (bar) bar.style.display = 'none';

  const previewEl = document.getElementById('route-summary-preview');
  if (previewEl) previewEl.style.display = 'none';

  const filtered = getFilteredStores();
  renderConstellation(filtered);
  renderMarkers(filtered);
};

window.recenterNavCamera = function() {
  if (userCurrentLocation) {
    map.setView(userCurrentLocation, 18, { animate: true });
  }
};

window.toggleNavSound = function() {
  isNavMuted = !isNavMuted;
  const btn = document.getElementById('btn-nav-sound');
  if (btn) btn.innerText = isNavMuted ? '🔇' : '🔊';
};

window.openDetailSheet = function(id) {
  const store = stores.find(s => s.id === id);
  if (!store) return;

  selectedStoreId = id;
  document.getElementById('sheet-store-name').innerText = store.name;
  document.getElementById('sheet-store-category').innerText = store.category || '蔬食';
  
  const isUnlocked = isStoreUnlockedForCurrentView(store);
  const myEmail = currentUser ? currentUser.email.toLowerCase() : "";
  const isMyVisited = Array.isArray(store.visitedBy) && store.visitedBy.includes(myEmail);

  const statusBadge = document.getElementById('sheet-store-status');
  if (isUnlocked) {
    statusBadge.innerText = '❤️ 已打卡';
    statusBadge.className = 'detail-badge-pill detail-badge-visited';
  } else {
    statusBadge.innerText = '🔖 待造訪';
    statusBadge.className = 'detail-badge-pill';
  }

  const count = Array.isArray(store.visitedBy) ? store.visitedBy.length : 0;
  document.getElementById('sheet-store-whovisited').innerText = `👥 ${count}人打卡`;
  document.getElementById('sheet-store-address').innerText = `📍 ${store.address || `${store.lat.toFixed(4)},${store.lng.toFixed(4)}`}`;

  const recBox = document.getElementById('sheet-store-recommended');
  if (store.recommended && store.recommended.trim()) {
    recBox.style.display = 'flex';
    recBox.querySelector('span').innerText = store.recommended;
  } else {
    recBox.style.display = 'none';
  }

  document.getElementById('sheet-btn-route-here').onclick = () => planRouteToStore(store.id);

  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}&destination_place_id=${encodeURIComponent(store.name)}`;
  document.getElementById('sheet-btn-navigate').href = navUrl;

  // 🎯 按鈕代表「點擊後的動作」：沒吃過顯示💖，已吃過顯示🤍
  const toggleBtn = document.getElementById('sheet-btn-toggle-visited');
  toggleBtn.innerText = isMyVisited ? '🤍' : '💖';
  toggleBtn.title = isMyVisited ? '點擊取消打卡' : '點擊點亮打卡';
  
  toggleBtn.onclick = () => {
    toggleVisited(store.id);
  };

  document.getElementById('sheet-btn-edit').onclick = () => openEditModal(store.id);
  document.getElementById('sheet-btn-delete').onclick = () => {
    deleteStore(store.id);
  };

  document.getElementById('gmaps-detail-sheet').classList.add('active');
  flyToWithOffset(store.lat, store.lng, 16.5);

  if (window.innerWidth <= 768) setMobileSheetState('collapsed');
};

window.closeDetailSheet = function() {
  document.getElementById('gmaps-detail-sheet').classList.remove('active');
  selectedStoreId = null;
};

// ─── 手機端滑動抽屜邏輯 ───
const sidebar = document.getElementById('sidebar');
const headerTouchZone = document.getElementById('sheet-header-zone');
let sheetState = 'collapsed';
let isDragging = false;
let startY = 0;
let startHeight = 0;
let lastY = 0;
let lastTime = 0;
let dragVelocity = 0;

window.setMobileSheetState = function(state) {
  sidebar.classList.remove('is-dragging');
  sidebar.style.height = '';
  sidebar.classList.remove('sheet-collapsed', 'sheet-half', 'sheet-full');
  sidebar.classList.add(`sheet-${state}`);
  sheetState = state;
  setTimeout(() => map.invalidateSize(), 300);
};

headerTouchZone.addEventListener('touchstart', (e) => {
  if (window.innerWidth > 768) return;
  isDragging = true;
  startY = e.touches[0].clientY;
  lastY = startY;
  lastTime = performance.now();
  dragVelocity = 0;
  startHeight = sidebar.getBoundingClientRect().height;
  sidebar.classList.add('is-dragging');
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (!isDragging || window.innerWidth > 768) return;
  const currentY = e.touches[0].clientY;
  const now = performance.now();
  const dt = now - lastTime;
  if (dt > 12) {
    dragVelocity = (lastY - currentY) / dt;
    lastY = currentY;
    lastTime = now;
  }
  const deltaY = startY - currentY;
  const targetH = Math.max(64, Math.min(window.innerHeight * 0.96, startHeight + deltaY));
  sidebar.style.height = `${targetH}px`;
}, { passive: true });

window.addEventListener('touchend', () => {
  if (!isDragging || window.innerWidth > 768) return;
  isDragging = false;
  sidebar.classList.remove('is-dragging');

  if (dragVelocity > 0.45) {
    if (sheetState === 'collapsed') setMobileSheetState('half');
    else setMobileSheetState('full');
    return;
  }
  if (dragVelocity < -0.45) {
    if (sheetState === 'full') setMobileSheetState('half');
    else setMobileSheetState('collapsed');
    return;
  }

  const finalH = sidebar.getBoundingClientRect().height;
  const winH = window.innerHeight;

  if (finalH < winH * 0.22) setMobileSheetState('collapsed');
  else if (finalH < winH * 0.62) setMobileSheetState('half');
  else setMobileSheetState('full');
});

map.on('click', () => {
  document.querySelectorAll('.search-suggestions-dropdown').forEach(d => d.classList.remove('active'));
  const picker = document.getElementById('layer-picker-horizontal');
  if (picker) picker.classList.remove('active');
  document.getElementById('ig-dock-container')?.classList.remove('active');
  closeDetailSheet();
  if (window.innerWidth <= 768 && sheetState !== 'collapsed') {
    setMobileSheetState('collapsed');
  }
});

window.handleSearchSync = function(val) {
  const kw = val.trim().toLowerCase();
  
  document.querySelectorAll('.search-input-field').forEach(input => {
    if (input.value !== val) input.value = val;
  });

  const dropdowns = [
    document.getElementById('search-suggestions-desktop'),
    document.getElementById('search-suggestions-mobile')
  ];

  if (!kw) {
    dropdowns.forEach(d => { if (d) { d.classList.remove('active'); d.innerHTML = ''; } });
    return;
  }

  const matches = stores.filter(s => 
    s.name.toLowerCase().includes(kw) || 
    (s.address && s.address.toLowerCase().includes(kw)) ||
    (s.category && s.category.toLowerCase().includes(kw)) ||
    (s.recommended && s.recommended.toLowerCase().includes(kw))
  );

  if (matches.length > 0) {
    const html = matches.slice(0, 5).map(s => `
      <div class="suggestion-item" onclick="selectStoreFromSearch('${s.id}')">
        <div class="suggestion-info">
          <span class="suggestion-name">${s.name}</span>
          <span class="suggestion-sub">📍 ${s.address || '地區店家'} ${s.recommended ? `· ✨${s.recommended}` : ''}</span>
        </div>
        <span class="suggestion-badge">${s.category || '蔬食'}</span>
      </div>
    `).join('');
    dropdowns.forEach(d => { if (d) { d.innerHTML = html; d.classList.add('active'); } });
  } else {
    dropdowns.forEach(d => { if (d) { d.classList.remove('active'); d.innerHTML = ''; } });
  }
};

document.querySelectorAll('.search-input-field').forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const kw = input.value.trim().toLowerCase();
      if (!kw) return;
      const matched = stores.find(s => 
        s.name.toLowerCase().includes(kw) || 
        (s.address && s.address.toLowerCase().includes(kw))
      );
      if (matched) selectStoreFromSearch(matched.id);
    }
  });
});

window.selectStoreFromSearch = function(id) {
  const store = stores.find(s => s.id === id);
  if (!store) return;
  
  document.querySelectorAll('.search-input-field').forEach(input => input.value = store.name);
  document.querySelectorAll('.search-suggestions-dropdown').forEach(d => d.classList.remove('active'));
  document.querySelectorAll('.search-input-field').forEach(input => input.blur());
  
  openDetailSheet(id);
  
  if (window.innerWidth > 768) {
    setTimeout(() => {
      const card = document.querySelector(`.store-card[data-id="${id}"]`);
      if (card) {
        document.querySelectorAll('.store-card').forEach(c => c.classList.remove('highlight-card'));
        card.classList.add('highlight-card');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 200);
  }
};

window.openUserMenu = function() {
  document.getElementById('user-menu-modal').classList.add('active');
};

window.closeUserMenu = function() {
  document.getElementById('user-menu-modal').classList.remove('active');
};

window.confirmLogout = async function() {
  closeUserMenu();
  if (currentUser) {
    await signOut(auth);
  }
};

window.handleAuth = async function() {
  if (!isFirebaseReady) return alert('請先填入正確的 firebaseConfig！');
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    alert(`登入失敗：${err.message}`);
  }
};

let currentCategory = 'all';
let statusFilter = 'all';

window.setCategoryFilter = function(cat) {
  currentCategory = cat;
  
  document.querySelectorAll('.story-item').forEach(item => {
    const label = item.querySelector('.story-label')?.innerText.trim();
    if (label === (cat === 'all' ? '全部' : cat)) {
      item.classList.add('active');
    } else if (label !== '已打卡' && label !== '待造訪') {
      item.classList.remove('active');
    }
  });

  refreshAll();
};

window.toggleStatusFilter = function(type) {
  if (statusFilter === type) {
    statusFilter = 'all';
  } else {
    statusFilter = type;
  }

  const visitedRings = [document.getElementById('desktop-status-ring-visited'), document.getElementById('mobile-status-ring-visited')];
  const unvisitedRings = [document.getElementById('desktop-status-ring-unvisited'), document.getElementById('mobile-status-ring-unvisited')];

  visitedRings.forEach(ring => {
    if (ring) ring.style.background = statusFilter === 'visited' ? 'var(--star-gradient)' : '#27272a';
  });
  unvisitedRings.forEach(ring => {
    if (ring) ring.style.background = statusFilter === 'unvisited' ? 'var(--star-gradient)' : '#27272a';
  });

  refreshAll();
};

function getFilteredStores() {
  return stores.filter(s => {
    const matchCategory = (currentCategory === 'all') || (s.category && s.category.includes(currentCategory));
    const isUnlocked = isStoreUnlockedForCurrentView(s);

    let matchStatus = true;
    if (statusFilter === 'visited') matchStatus = isUnlocked;
    if (statusFilter === 'unvisited') matchStatus = !isUnlocked;
    return matchCategory && matchStatus;
  });
}

async function reverseGeocode(lat, lng) {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'zh-TW,zh;q=0.9' }
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (data && data.address) {
      const addr = data.address;
      let houseNum = addr.house_number || '';
      if (houseNum && !houseNum.endsWith('號')) {
        houseNum += '號';
      }
      const formatted = `${addr.city || addr.county || ''}${addr.suburb || addr.district || ''}${addr.road || ''}${houseNum}`;
      geocodeCache.set(cacheKey, formatted);
      return formatted;
    }
  } catch (e) {
    clearTimeout(timeoutId);
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

window.handleQuickAdd = async function() {
  if (!currentUser) return alert('請先登入！');
  const input = document.getElementById('gmaps-input').value.trim();
  if (!input) return;

  const btn = document.getElementById('btn-quick-submit');
  btn.innerText = '...';
  btn.disabled = true;

  let lat = 24.805, lng = 120.975;
  let detectedName = '';
  let address = '';

  if (input.includes('google.com/maps') || input.includes('goo.gl')) {
    const nameMatch = input.match(/\/place\/([^\/@?]+)/);
    if (nameMatch && nameMatch[1]) {
      try {
        detectedName = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      } catch (e) {
        detectedName = nameMatch[1];
      }
    }

    const preciseMatch = input.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const atMatch = input.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

    if (preciseMatch) {
      lat = parseFloat(preciseMatch[1]);
      lng = parseFloat(preciseMatch[2]);
    } else if (atMatch) {
      lat = parseFloat(atMatch[1]);
      lng = parseFloat(atMatch[2]);
    }

    address = await reverseGeocode(lat, lng);
  } else {
    const coordMatch = input.match(/(-?\d+\.\d+)\s*[,，\s]\s*(-?\d+\.\d+)/);
    if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lng = parseFloat(coordMatch[2]);
      address = await reverseGeocode(lat, lng);
    } else {
      address = input;
    }
  }

  const finalName = prompt('📍 請確認店家名稱：', detectedName || '新蔬食店家');
  btn.innerText = '新增';
  btn.disabled = false;

  if (finalName) {
    await addDoc(storesCollection, {
      name: finalName.trim(),
      address: address || '',
      category: '蛋奶素',
      recommended: '',
      visitedBy: [],
      lat,
      lng,
      order: stores.length,
      createdAt: serverTimestamp ? serverTimestamp() : Date.now()
    });
    document.getElementById('gmaps-input').value = '';
  }
};

function renderConstellation(filteredStores) {
  constellationLayer.clearLayers();
  if (isNavigating) return;

  const visited = filteredStores.filter(s => isStoreUnlockedForCurrentView(s));
  if (visited.length < 2) return;

  const bounds = map.getBounds().pad(0.25);
  const visibleVisited = visited.filter(s => bounds.contains([s.lat, s.lng]));
  if (visibleVisited.length < 2) return;

  const zoom = map.getZoom();
  let maxDist = 1200;
  if (zoom >= 16) maxDist = 2000;
  else if (zoom >= 14) maxDist = 1400;
  else if (zoom <= 12) maxDist = 600;

  const connectedPairs = new Set();

  visibleVisited.forEach((p1, i) => {
    const neighbors = [];
    visibleVisited.forEach((p2, j) => {
      if (i !== j) {
        const dist = L.latLng(p1.lat, p1.lng).distanceTo(L.latLng(p2.lat, p2.lng));
        if (dist <= maxDist) {
          neighbors.push({ p2, j, dist });
        }
      }
    });

    neighbors.sort((a, b) => a.dist - b.dist);
    const closest = neighbors.slice(0, 2);

    closest.forEach(({ p2, j }) => {
      const pairKey = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!connectedPairs.has(pairKey)) {
        connectedPairs.add(pairKey);
        const latlngs = [[p1.lat, p1.lng], [p2.lat, p2.lng]];
        L.polyline(latlngs, { color: '#06b6d4', weight: zoom >= 14 ? 3 : 1.8, opacity: 0.45, lineJoin: 'round' }).addTo(constellationLayer);
        L.polyline(latlngs, { 
          color: '#10b981', 
          weight: zoom >= 14 ? 1.8 : 1.0, 
          className: 'constellation-ray',
          opacity: 0.95 
        }).addTo(constellationLayer);
      }
    });
  });
}

function renderMarkers(filteredStores) {
  markersLayer.clearLayers();
  for (const id in markersRef) delete markersRef[id];

  const zoom = map.getZoom();
  const isDense = zoom < 14;

  const targetStores = (isNavigating && activeNavStoreId) 
    ? filteredStores.filter(s => s.id === activeNavStoreId) 
    : filteredStores;

  targetStores.forEach(s => {
    let size, iconHtml;
    const isUnlocked = isStoreUnlockedForCurrentView(s);

    if (isDense) {
      if (isUnlocked) {
        size = 12;
        iconHtml = `<div class="marker-dot-unlocked" style="width:${size}px; height:${size}px;"></div>`;
      } else {
        size = 5;
        iconHtml = `<div class="marker-dot-locked" style="width:${size}px; height:${size}px;"></div>`;
      }
    } else {
      size = isUnlocked ? 28 : 20;
      const fontSize = isUnlocked ? 13 : 10;
      const iconChar = getCategoryIcon(s.category);

      iconHtml = `
        <div class="custom-marker ${isUnlocked ? 'marker-unlocked' : 'marker-locked'}" 
             style="width:${size}px; height:${size}px; font-size:${fontSize}px;">
          <div class="${isUnlocked ? 'marker-unlocked-inner' : ''}">
            ${iconChar}
          </div>
        </div>
      `;
    }

    const marker = L.marker([s.lat, s.lng], {
      icon: L.divIcon({ html: iconHtml, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
    }).addTo(markersLayer);
    markersRef[s.id] = marker;

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      openDetailSheet(s.id);
    });
  });
}

map.on('zoomend moveend', () => {
  const filtered = getFilteredStores();
  renderConstellation(filtered);
  renderMarkers(filtered);
});

function updateSidebar(filteredStores) {
  const listEl = document.getElementById('restaurant-list');
  listEl.innerHTML = '';

  const total = stores.length;
  const visitedCount = stores.filter(s => isStoreUnlockedForCurrentView(s)).length;
  const pct = total > 0 ? Math.round((visitedCount / total) * 100) : 0;

  const activeViewName = viewingTargetEmail === "mine" ? "我" : getMemberDisplayName(viewingTargetEmail);
  document.getElementById('peek-stats-text').innerText = `${activeViewName}已點亮 ${visitedCount} / ${total}`;

  const desktopTotal = document.getElementById('desktop-stat-total');
  const desktopVisited = document.getElementById('desktop-stat-visited');
  const desktopPct = document.getElementById('desktop-stat-pct');
  const desktopRank = document.getElementById('desktop-rank-name');
  const desktopRatio = document.getElementById('desktop-stat-ratio');
  const desktopBar = document.getElementById('desktop-progress-bar');

  if (desktopTotal && desktopVisited && desktopPct) {
    desktopTotal.innerText = total;
    desktopVisited.innerText = visitedCount;
    desktopPct.innerText = `${pct}%`;
    desktopRank.innerText = calculateRank(visitedCount, total);
    desktopRatio.innerText = `${visitedCount} / ${total}`;
    desktopBar.style.width = `${pct}%`;
  }

  if (filteredStores.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; padding:30px; color:var(--app-text-sub); font-size:12px;">無符合店家</div>`;
    return;
  }

  const myEmail = currentUser ? currentUser.email.toLowerCase() : "";

  filteredStores.forEach((s) => {
    const isUnlocked = isStoreUnlockedForCurrentView(s);
    const isMyVisited = Array.isArray(s.visitedBy) && s.visitedBy.includes(myEmail);
    const card = document.createElement('div');
    card.className = `store-card ${isUnlocked ? 'is-unlocked' : ''}`;
    card.setAttribute('data-id', s.id);

    card.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      toggleVisited(s.id);
    });

    // 🎯 按鈕代表「點擊後的動作」：沒吃過顯示💖，已吃過顯示🤍
    card.innerHTML = `
      <div class="card-top">
        <div class="store-title-group">
          <span class="drag-handle" title="按住拖曳">⋮⋮</span>
          <span class="store-title">${s.name}</span>
        </div>
        <span class="badge-status ${isUnlocked ? 'badge-unlocked' : 'badge-locked'}">
          ${isUnlocked ? '❤️ 已點亮' : '待造訪'}
        </span>
      </div>
      <div class="store-address">📍 ${s.address || `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`}</div>
      ${s.recommended ? `<div class="store-recommended-chip">✨ ${s.recommended}</div>` : ''}
      <div class="card-bottom">
        <span class="tag-pill">${s.category || '蔬食'}</span>
        <div class="card-actions">
          <button class="btn-heart" title="${isMyVisited ? '點擊取消打卡' : '點擊點亮打卡'}" onclick="event.stopPropagation(); toggleVisited('${s.id}')">
            ${isMyVisited ? '🤍' : '💖'}
          </button>
          <button class="card-edit-btn" onclick="event.stopPropagation(); openEditModal('${s.id}')">✏️ 編輯</button>
        </div>
      </div>
    `;
    card.onclick = () => focusStore(s.id);
    listEl.appendChild(card);
  });

  if (sortableInstance) sortableInstance.destroy();
  const isCustomSortAllowed = currentCategory === 'all' && statusFilter === 'all';

  sortableInstance = new Sortable(listEl, {
    animation: 180,
    handle: '.drag-handle',
    disabled: !isCustomSortAllowed,
    onEnd: async function () {
      const itemEls = Array.from(listEl.querySelectorAll('.store-card'));
      const newOrderIds = itemEls.map(el => el.getAttribute('data-id'));

      stores.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));

      if (isFirebaseReady && currentUser) {
        const batch = writeBatch(db);
        stores.forEach((s, idx) => {
          s.order = idx;
          batch.update(doc(db, "vegan_stores", s.id), { order: idx });
        });
        await batch.commit();
      }
      renderConstellation(getFilteredStores());
    }
  });
}

window.focusStore = function(id) {
  openDetailSheet(id);
};

// ─── 🌟 超新星引力收束爆發 & 黑洞寂滅特效 ───
function playStarMapAnimation(lat, lng, isIgniting) {
  if (!map.getBounds().contains([lat, lng])) {
    map.panTo([lat, lng], { animate: true, duration: 0.35 });
  }

  let fxHtml = '';
  if (isIgniting) {
    fxHtml = `
      <div class="star-fx-container">
        <div class="fx-converge-ring"></div>
        <div class="fx-converge-ring"></div>
        <div class="fx-burst-core"></div>
        <div class="fx-burst-shockwave"></div>
      </div>
    `;
  } else {
    fxHtml = `
      <div class="star-fx-container">
        <div class="fx-extinguish-pulse"></div>
        <div class="fx-extinguish-collapse"></div>
      </div>
    `;
  }

  const fxMarker = L.marker([lat, lng], {
    icon: L.divIcon({ html: fxHtml, className: '', iconSize: [0, 0] }),
    zIndexOffset: 4000
  }).addTo(map);

  if (isIgniting) {
    if (navigator.vibrate) navigator.vibrate([30, 40, 50, 40, 90]);
    setTimeout(() => {
      if (typeof confetti === 'function') {
        const pt = map.latLngToContainerPoint([lat, lng]);
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { x: pt.x / window.innerWidth, y: pt.y / window.innerHeight },
          colors: ['#10b981', '#06b6d4', '#8b5cf6', '#fef08a']
        });
      }
    }, 500);
  } else {
    if (navigator.vibrate) navigator.vibrate([60, 30, 20]);
  }

  setTimeout(() => {
    try { map.removeLayer(fxMarker); } catch (e) {}
  }, 1400);
}

// ─── 打卡切換邏輯 ───
window.toggleVisited = async function(id) {
  if (!currentUser) return alert('請先登入！');
  const target = stores.find(s => s.id === id);
  if (!target) return;

  const myEmail = currentUser.email.toLowerCase();
  let visitedBy = Array.isArray(target.visitedBy) ? [...target.visitedBy] : [];
  let isNowVisited = false;

  if (visitedBy.includes(myEmail)) {
    visitedBy = visitedBy.filter(e => e !== myEmail);
    isNowVisited = false;
  } else {
    visitedBy.push(myEmail);
    isNowVisited = true;
  }

  target.visitedBy = visitedBy;
  target.visited = visitedBy.length > 0;

  playStarMapAnimation(target.lat, target.lng, isNowVisited);
  refreshAll();

  if (selectedStoreId === id) {
    const statusBadge = document.getElementById('sheet-store-status');
    const toggleBtn = document.getElementById('sheet-btn-toggle-visited');
    const countEl = document.getElementById('sheet-store-whovisited');

    const isCurrentViewUnlocked = isStoreUnlockedForCurrentView(target);
    if (statusBadge) {
      if (isCurrentViewUnlocked) {
        statusBadge.innerText = '❤️ 已打卡';
        statusBadge.className = 'detail-badge-pill detail-badge-visited';
      } else {
        statusBadge.innerText = '🔖 待造訪';
        statusBadge.className = 'detail-badge-pill';
      }
    }
    // 🎯 按鈕代表「點擊後的動作」：沒吃過顯示💖，已吃過顯示🤍
    if (toggleBtn) {
      toggleBtn.innerText = isNowVisited ? '🤍' : '💖';
      toggleBtn.title = isNowVisited ? '已打卡（點擊取消打卡）' : '待造訪（點擊點亮打卡）';
    }
    if (countEl) {
      countEl.innerText = `👥 ${visitedBy.length}人打卡`;
    }
  }

  try {
    await updateDoc(doc(db, "vegan_stores", id), { 
      visitedBy: visitedBy,
      visited: visitedBy.length > 0
    });
  } catch (err) {
    console.error("更新打卡狀態失敗:", err);
    alert("更新狀態失敗，請檢查網路連線");
  }
};

window.deleteStore = function(id) {
  if (!currentUser) return alert('請先登入！');
  const store = stores.find(s => s.id === id);
  pendingDeleteStoreId = id;

  const nameEl = document.getElementById('delete-confirm-store-name');
  if (nameEl && store) {
    nameEl.innerText = `確定要將「${store.name}」自星圖移除嗎？刪除後將無法復原。`;
  } else if (nameEl) {
    nameEl.innerText = `刪除後將無法復原店家資料與打卡紀錄。`;
  }

  document.getElementById('delete-confirm-modal').classList.add('active');
};

window.closeDeleteConfirmModal = function() {
  pendingDeleteStoreId = null;
  document.getElementById('delete-confirm-modal').classList.remove('active');
};

window.executeDeleteStore = async function() {
  if (!pendingDeleteStoreId || !currentUser) return;
  const targetId = pendingDeleteStoreId;
  const btn = document.getElementById('btn-execute-delete');
  
  btn.innerText = '刪除中...';
  btn.disabled = true;

  try {
    await deleteDoc(doc(db, "vegan_stores", targetId));
    closeDeleteConfirmModal();
    closeDetailSheet();
  } catch (err) {
    alert(`刪除失敗：${err.message}`);
  } finally {
    btn.innerText = '確定刪除';
    btn.disabled = false;
  }
};

window.clearAllStores = async function() {
  if (!currentUser) return alert('請先登入！');
  if (confirm('⚠️ 確定要清空所有店家名單嗎？')) {
    const batch = writeBatch(db);
    stores.forEach(s => batch.delete(doc(db, "vegan_stores", s.id)));
    await batch.commit();
  }
};

window.openEditModal = function(id) {
  if (!currentUser) return alert('請先登入！');
  const store = stores.find(s => s.id === id);
  if (!store) return;

  document.getElementById('modal-title').innerText = '✏️ 編輯貼文資訊';
  document.getElementById('form-id').value = store.id;
  document.getElementById('form-name').value = store.name;
  document.getElementById('form-address').value = store.address || '';
  document.getElementById('form-recommended').value = store.recommended || '';
  document.getElementById('form-category').value = store.category || '蛋奶素';
  document.getElementById('form-lat').value = store.lat;
  document.getElementById('form-lng').value = store.lng;
  document.getElementById('modal').classList.add('active');
};

window.closeModal = function() {
  document.getElementById('modal').classList.remove('active');
};

window.saveFormStore = async function() {
  if (!currentUser) return alert('請先登入！');
  const editId = document.getElementById('form-id').value;
  const name = document.getElementById('form-name').value.trim();
  let address = document.getElementById('form-address').value.trim();
  const recommended = document.getElementById('form-recommended').value.trim();
  const category = document.getElementById('form-category').value.trim() || '蛋奶素';
  let lat = parseFloat(document.getElementById('form-lat').value) || 24.805;
  let lng = parseFloat(document.getElementById('form-lng').value) || 120.975;

  if (!name) return alert('請輸入店名！');

  const coordMatch = address.match(/(-?\d+\.\d+)\s*[,，\s]\s*(-?\d+\.\d+)/);
  if (coordMatch) {
    lat = parseFloat(coordMatch[1]);
    lng = parseFloat(coordMatch[2]);
    const realAddr = await reverseGeocode(lat, lng);
    if (realAddr) address = realAddr;
  }

  const payload = { name, address, category, recommended, lat, lng };

  if (editId) {
    await updateDoc(doc(db, "vegan_stores", editId), payload);
  } else {
    payload.order = stores.length;
    payload.visitedBy = [];
    payload.createdAt = serverTimestamp ? serverTimestamp() : Date.now();
    await addDoc(storesCollection, payload);
  }

  closeModal();
};

window.exportData = function() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(stores, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `vegan_map_${new Date().toISOString().slice(0,10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
};

window.importData = async function(event) {
  if (!currentUser) return alert('請先登入授權帳號！');
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (Array.isArray(imported)) {
        const batch = writeBatch(db);
        imported.forEach((item, index) => {
          const newDocRef = doc(storesCollection);
          batch.set(newDocRef, {
            name: item.name || '未命名',
            address: item.address || '',
            category: item.category || '蛋奶素',
            recommended: item.recommended || '',
            visitedBy: Array.isArray(item.visitedBy) ? item.visitedBy : (item.visited ? [currentUser.email.toLowerCase()] : []),
            lat: typeof item.lat === 'number' ? item.lat : parseFloat(item.lat) || 24.805,
            lng: typeof item.lng === 'number' ? item.lng : parseFloat(item.lng) || 120.975,
            order: typeof item.order === 'number' ? item.order : index,
            createdAt: Date.now()
          });
        });
        await batch.commit();
        alert(`✅ 成功匯入 ${imported.length} 筆店家！`);
      }
    } catch (err) {
      alert('匯入失敗：格式不正確。');
    }
    event.target.value = '';
  };
  reader.readAsText(file, 'UTF-8');
};

// ─── ✨ AI 貼文 / 短文智慧辨識與地理編碼模組 ───
const DEFAULT_GEMINI_API_KEY = "";

function getGeminiApiKey() {
  return localStorage.getItem('gemini_api_key') || DEFAULT_GEMINI_API_KEY;
}

window.promptSetGeminiKey = function() {
  const currentKey = getGeminiApiKey();
  const newKey = prompt("請輸入 Google Gemini API Key（免費申請即可使用）：", currentKey);
  if (newKey !== null) {
    localStorage.setItem('gemini_api_key', newKey.trim());
    alert("✅ Gemini API Key 已成功儲存於瀏覽器！");
  }
};

window.openAiImportModal = function() {
  if (!currentUser) return alert('請先登入帳號！');
  document.getElementById('ai-raw-text').value = '';
  document.getElementById('ai-result-preview').style.display = 'none';
  document.getElementById('ai-import-modal').classList.add('active');
};

window.closeAiImportModal = function() {
  document.getElementById('ai-import-modal').classList.remove('active');
};

async function forwardGeocode(address) {
  if (!address) return null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, {
      headers: { 'Accept-Language': 'zh-TW,zh;q=0.9' }
    });
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
  } catch (e) {
    console.warn("地理編碼失敗:", e);
  }
  return null;
}

window.runAiParsing = async function() {
  const rawText = document.getElementById('ai-raw-text').value.trim();
  if (!rawText) return alert('請貼上貼文內容、短訊或地址介紹！');

  const rawKey = getGeminiApiKey();
  const apiKey = rawKey ? rawKey.trim() : "";
  
  if (!apiKey || apiKey.length < 20) {
    alert("⚠️ 尚未偵測到有效的 API Key，請先設定金鑰！");
    window.promptSetGeminiKey();
    return;
  }

  const btn = document.getElementById('btn-run-ai');
  btn.innerText = '✨ AI 分析中...';
  btn.disabled = true;

  const prompt = `
你是一位精通台灣美食與素食地圖的整理秘書。請從以下這段雜亂的文字中，萃取店家關鍵資訊。
文字內容：
"""${rawText}"""

請務必遵守以下規格輸出標準 JSON：
1. "name": 店家名稱（去掉多餘形容詞或 hashtag，只留乾淨店名）
2. "address": 實體地址（若文中只有路名或地標，請儘量推估或保留關鍵路名，若完全無地址請給空字串）
3. "category": 必須嚴格是這 5 種之一：["純素", "蛋奶素", "早午餐", "甜點", "異國"]。若無法判斷請給 "蛋奶素"。
4. "recommended": 推薦必點菜色（提取文中提到的招牌菜，以逗號分隔，簡短即可）
`;

  try {
    // 使用官方標準端點並透過 Header 傳遞 API Key
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey 
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => null);
      const errorMsg = errorJson?.error?.message || `HTTP ${response.status}`;
      console.error("Google API 原始錯誤回應：", errorJson);
      throw new Error(`Google 回傳錯誤：${errorMsg}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(resultText);

    document.getElementById('ai-parsed-name').value = parsed.name || '';
    document.getElementById('ai-parsed-address').value = parsed.address || '';
    document.getElementById('ai-parsed-category').value = parsed.category || '蛋奶素';
    document.getElementById('ai-parsed-recommended').value = parsed.recommended || '';

    const previewBox = document.getElementById('ai-result-preview');
    const geoStatus = document.getElementById('ai-geo-status');
    previewBox.style.display = 'flex';
    geoStatus.innerText = '🔍 定位經緯度中...';

    let lat = 24.805, lng = 120.975;
    if (parsed.address) {
      const geoResult = await forwardGeocode(parsed.address);
      if (geoResult) {
        lat = geoResult.lat;
        lng = geoResult.lng;
        geoStatus.innerText = '📍 座標定位成功';
        geoStatus.style.color = '#10b981';
      } else {
        geoStatus.innerText = '⚠️ 無法精確定位，使用地圖預設點';
        geoStatus.style.color = '#f59e0b';
      }
    } else {
      geoStatus.innerText = '⚠️ 未提供地址，使用地圖預設點';
      geoStatus.style.color = '#f59e0b';
    }

    document.getElementById('ai-parsed-lat').value = lat;
    document.getElementById('ai-parsed-lng').value = lng;

  } catch (err) {
    alert(`AI 辨識發生錯誤：${err.message}`);
  } finally {
    btn.innerText = '🚀 開始 AI 分析';
    btn.disabled = false;
  }
};

window.saveAiParsedStore = async function() {
  if (!currentUser) return alert('請先登入！');

  const name = document.getElementById('ai-parsed-name').value.trim();
  const address = document.getElementById('ai-parsed-address').value.trim();
  const category = document.getElementById('ai-parsed-category').value;
  const recommended = document.getElementById('ai-parsed-recommended').value.trim();
  const lat = parseFloat(document.getElementById('ai-parsed-lat').value) || 24.805;
  const lng = parseFloat(document.getElementById('ai-parsed-lng').value) || 120.975;

  if (!name) return alert('請填寫店名！');

  const btn = document.getElementById('btn-confirm-ai-save');
  btn.innerText = '儲存中...';
  btn.disabled = true;

  try {
    const docRef = await addDoc(storesCollection, {
      name,
      address,
      category,
      recommended,
      lat,
      lng,
      visitedBy: [],
      order: stores.length,
      createdAt: serverTimestamp ? serverTimestamp() : Date.now()
    });

    closeAiImportModal();
    alert(`🎉 成功新增「${name}」！`);
    
    setTimeout(() => {
      focusStore(docRef.id);
      playStarMapAnimation(lat, lng, true);
    }, 400);

  } catch (err) {
    alert(`儲存失敗：${err.message}`);
  } finally {
    btn.innerText = '✅ 確認無誤，加入星圖';
    btn.disabled = false;
  }
};

function refreshAll() {
  const filtered = getFilteredStores();
  renderConstellation(filtered);
  renderMarkers(filtered);
  updateSidebar(filtered);
  updateDockCapsuleUI();
}

refreshAll();

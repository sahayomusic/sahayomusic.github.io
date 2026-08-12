// Track list + artist name are loaded from playlist.js (loaded below).
  // Edit playlist.js to add or remove songs — this file never needs to change.
  const tracks = (window.PLAYLIST || []).map(filename => {
    const nameOnly = filename.replace(/\.[^/.]+$/, ''); // strip extension
    const title = nameOnly.replace(/[-_]+/g, ' ').replace(/(^|\s)\S/g, c => c.toUpperCase());
    return { title, artist: window.ARTIST_NAME || 'Unknown Artist', src: 'audio/' + filename };
  });

  const els = {
    eyebrow: document.getElementById('eyebrow'),
    offlineBanner: document.getElementById('offlineBanner'),
    platter: document.getElementById('platter'),
    labelArt: document.getElementById('labelArt'),
    title: document.getElementById('trackTitle'),
    artist: document.getElementById('trackArtist'),
    seek: document.getElementById('seek'),
    curTime: document.getElementById('curTime'),
    durTime: document.getElementById('durTime'),
    playBtn: document.getElementById('playBtn'),
    playIcon: document.getElementById('playIcon'),
    pauseIcon: document.getElementById('pauseIcon'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    repeatBtn: document.getElementById('repeatBtn'),
    playerLikeBtn: document.getElementById('playerLikeBtn'),
    playlist: document.getElementById('playlist'),
    emptyNote: document.getElementById('emptyNote'),
    likedFilterBtn: document.getElementById('likedFilterBtn'),
    searchBox: document.getElementById('searchBox'),
    shareBtn: document.getElementById('shareBtn'),
    shareLabel: document.getElementById('shareLabel'),
    lyricsBtn: document.getElementById('lyricsBtn'),
    listView: document.getElementById('listView'),
    lyricsView: document.getElementById('lyricsView'),
    viewBackBtn: document.getElementById('viewBackBtn'),
    headerActions: document.getElementById('headerActions'),
    likedSubnote: document.getElementById('likedSubnote'),
    playlistHeading: document.getElementById('playlistHeading'),
    lyricsSongTitle: document.getElementById('lyricsSongTitle'),
    lyricsSongArtist: document.getElementById('lyricsSongArtist'),
    lyricsBody: document.getElementById('lyricsBody'),
    volumeBtn: document.getElementById('volumeBtn'),
    volumeSlider: document.getElementById('volumeSlider'),
    volIconOn: document.getElementById('volIconOn'),
    volIconOff: document.getElementById('volIconOff'),
  };

  let sound = null;
  let currentIndex = -1;
  let isPlaying = false;
  let shuffleOn = false;
  let repeatOn = false;
  let filterLikedOnly = false;
  let lastVolume = 0.8;
  let loadRetryCount = 0;
  let isBuffering = false;
  const MAX_LOAD_RETRIES = 4;
  let searchQuery = '';
  let seekInterval = null;
  let isSeeking = false;
  const trackDurations = {};

  function loadLiked() {
    try {
      const raw = localStorage.getItem('sahayo-liked-tracks');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) { return new Set(); }
  }

  function saveLiked() {
    try { localStorage.setItem('sahayo-liked-tracks', JSON.stringify([...likedSet])); }
    catch (e) { /* storage unavailable, likes just won't persist */ }
  }

  let likedSet = loadLiked();

  function getActiveIndices() {
    const all = tracks.map((_, i) => i);
    return all.filter(i => {
      const matchesLiked = !filterLikedOnly || likedSet.has(tracks[i].src);
      const matchesSearch = !searchQuery || tracks[i].title.toLowerCase().includes(searchQuery);
      return matchesLiked && matchesSearch;
    });
  }

  function toggleLike(index) {
    const src = tracks[index].src;
    if (likedSet.has(src)) likedSet.delete(src); else likedSet.add(src);
    saveLiked();
    renderPlaylist();
    syncPlayerLikeBtn();
  }

  function syncPlayerLikeBtn() {
    if (currentIndex === -1) return;
    const liked = likedSet.has(tracks[currentIndex].src);
    els.playerLikeBtn.classList.toggle('active', liked);
    els.playerLikeBtn.setAttribute('aria-pressed', liked);
    els.playerLikeBtn.setAttribute('aria-label', liked ? 'Unlike this song' : 'Like this song');
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function renderPlaylist() {
    if (tracks.length === 0) {
      els.emptyNote.innerHTML = 'No tracks yet. Add your song filenames to <code>playlist.js</code>, then reload.';
      els.emptyNote.style.display = 'block';
      els.playlist.style.display = 'none';
      return;
    }

    const active = getActiveIndices();

    if (active.length === 0) {
      if (searchQuery && filterLikedOnly) {
        els.emptyNote.textContent = `No liked songs match "${els.searchBox.value}".`;
      } else if (searchQuery) {
        els.emptyNote.textContent = `No songs match "${els.searchBox.value}".`;
      } else {
        els.emptyNote.textContent = 'No liked songs yet — tap the heart on songs you like.';
      }
      els.emptyNote.style.display = 'block';
      els.playlist.style.display = 'none';
      return;
    }

    els.emptyNote.style.display = 'none';
    els.playlist.style.display = '';

    const visible = active;

    els.playlist.innerHTML = '';
    visible.forEach(i => {
      const t = tracks[i];
      const liked = likedSet.has(t.src);
      const durText = trackDurations[i] ? fmtTime(trackDurations[i]) : '--:--';
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'track' + (i === currentIndex ? ' active' : '');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.innerHTML = `
        <span class="num">${(i + 1).toString().padStart(2, '0')}</span>
        <span class="meta">
          <span class="t-title">${t.title}</span>
        </span>
        <span class="t-dur" data-dur="${i}">${durText}</span>
        <button class="heart-btn${liked ? ' liked' : ''}" data-idx="${i}"
          aria-label="${liked ? 'Unlike' : 'Like'} ${t.title}" aria-pressed="${liked}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20.5C12 20.5 2.5 13.5 2.5 8.2C2.5 4.8 5.2 2.2 8.3 2.2C10.3 2.2 12 3.5 12 5.8C12 3.5 13.7 2.2 15.7 2.2C18.8 2.2 21.5 4.8 21.5 8.2C21.5 13.5 12 20.5 12 20.5Z"/>
          </svg>
        </button>
      `;
      function pickTrack() {
        if (searchQuery) {
          searchQuery = '';
          els.searchBox.value = '';
          renderPlaylist();
        }
        loadTrack(i, true);
      }
      row.addEventListener('click', pickTrack);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickTrack(); }
      });
      row.querySelector('.heart-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLike(i);
      });
      li.appendChild(row);
      els.playlist.appendChild(li);
    });
  }

  function updateActiveRow() {
    document.querySelectorAll('.track').forEach((el) => {
      const idx = Number(el.querySelector('.heart-btn').dataset.idx);
      const isActive = idx === currentIndex;
      el.classList.toggle('active', isActive);
      if (isActive) {
        scrollRowIntoPlaylist(el);
      }
    });
  }

  function scrollRowIntoPlaylist(rowEl) {
    const container = els.playlist;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    const delta = rowRect.top - containerRect.top;
    // Scrolls only this container's own scrollTop — never the outer
    // page — so the player never jumps out of view on mobile.
    container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' });
  }

  // Tries each cover art format in turn (webp first — smallest file size —
  // then jpg, then png) and falls back to the text label if none exist.
  // This means any format works for any song without touching this code.
  const COVER_FORMATS = ['.webp', '.jpg', '.png'];
  function loadCoverArt(coverBase, formatIndex = 0) {
    if (formatIndex >= COVER_FORMATS.length) {
      els.labelArt.classList.remove('visible');
      return;
    }
    els.labelArt.classList.remove('visible');
    els.labelArt.onload = () => els.labelArt.classList.add('visible');
    els.labelArt.onerror = () => loadCoverArt(coverBase, formatIndex + 1);
    els.labelArt.src = `images/${coverBase}${COVER_FORMATS[formatIndex]}`;
  }

  // Builds (or rebuilds, on retry) the Howl instance for a track.
  // html5:true (already set) lets the browser stream progressively
  // instead of needing the whole file downloaded before playing —
  // the single biggest fix for spotty connections. On top of that:
  // real retry-on-failure, and honest "Buffering…" feedback instead
  // of the player just looking frozen/broken during a network hiccup.
  function buildSound(t, autoplay) {
    sound = new Howl({
      src: [t.src],
      html5: true,
      onload: () => {
        const dur = sound.duration();
        trackDurations[currentIndex] = dur;
        els.durTime.textContent = fmtTime(dur);
        els.seek.max = dur;
        const durEl = document.querySelector(`.t-dur[data-dur="${currentIndex}"]`);
        if (durEl) durEl.textContent = fmtTime(dur);
        loadRetryCount = 0; // successful load resets the counter
      },
      onplay: () => { setPlayingState(true); startSeekLoop(); },
      onpause: () => setPlayingState(false),
      onend: () => {
        if (repeatOn) {
          playCurrent();
        } else {
          goNext();
        }
      },
      onloaderror: () => retryLoad(t, autoplay),
      onplayerror: () => retryLoad(t, autoplay),
    });

    // html5:true means Howler plays through a real <audio> element under
    // the hood — hooking its native events gives real buffering status
    // that Howler itself doesn't expose.
    const node = sound._sounds && sound._sounds[0] && sound._sounds[0]._node;
    if (node) {
      node.addEventListener('waiting', () => { isBuffering = true; updateEyebrowText(); });
      node.addEventListener('stalled', () => { isBuffering = true; updateEyebrowText(); });
      node.addEventListener('playing', () => { isBuffering = false; updateEyebrowText(); });
      node.addEventListener('canplay', () => { isBuffering = false; updateEyebrowText(); });
    }

    if (autoplay) sound.play();
  }

  function retryLoad(t, autoplay) {
    isBuffering = false;
    if (loadRetryCount >= MAX_LOAD_RETRIES) {
      els.eyebrow.textContent = 'Connection trouble — tap play to retry';
      return;
    }
    loadRetryCount++;
    els.eyebrow.textContent = `Connection trouble — retrying… (${loadRetryCount}/${MAX_LOAD_RETRIES})`;
    const delay = Math.min(1000 * Math.pow(2, loadRetryCount - 1), 8000); // 1s, 2s, 4s, 8s
    setTimeout(() => {
      if (sound) sound.unload();
      buildSound(t, autoplay);
    }, delay);
  }

  function loadTrack(index, autoplay) {
    if (tracks.length === 0) return;
    if (sound) { sound.unload(); }
    currentIndex = ((index % tracks.length) + tracks.length) % tracks.length;
    const t = tracks[currentIndex];
    loadRetryCount = 0;

    const coverBase = t.src.replace(/^audio\//, '').replace(/\.mp3$/i, '');
    loadCoverArt(coverBase);

    buildSound(t, autoplay);

    els.title.textContent = t.title;
    els.artist.textContent = t.artist;
    els.shareBtn.classList.add('visible');
    els.lyricsBtn.classList.add('visible');
    syncPlayerLikeBtn();
    els.seek.value = 0;
    els.curTime.textContent = '0:00';
    updateActiveRow();
    if (currentView === 'lyrics') refreshLyricsView();

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: t.artist,
        artwork: [
          { src: 'favicon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'favicon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      });
    }
  }

  function playCurrent() {
    if (!sound) return;
    sound.play();
  }

  function updateEyebrowText() {
    if (isBuffering) {
      els.eyebrow.textContent = 'Buffering…';
    } else {
      els.eyebrow.textContent = isPlaying ? 'Now Spinning' : (currentIndex === -1 ? 'Ready to Spin' : 'Paused');
    }
  }

  function setPlayingState(playing) {
    isPlaying = playing;
    els.platter.classList.toggle('playing', playing);
    els.playIcon.style.display = playing ? 'none' : 'block';
    els.pauseIcon.style.display = playing ? 'block' : 'none';
    els.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    updateEyebrowText();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
    if (!playing) stopSeekLoop();
  }

  function startSeekLoop() {
    stopSeekLoop();
    seekInterval = setInterval(() => {
      if (sound && sound.playing() && !isSeeking) {
        const cur = sound.seek() || 0;
        els.seek.value = cur;
        els.curTime.textContent = fmtTime(cur);
      }
    }, 250);
  }

  function stopSeekLoop() {
    if (seekInterval) clearInterval(seekInterval);
    seekInterval = null;
  }

  function goNext() {
    const active = getActiveIndices();
    if (active.length === 0) return;
    if (shuffleOn) { loadTrack(drawShuffle(active), true); return; }
    const pos = active.indexOf(currentIndex);
    const nextPos = pos === -1 ? 0 : (pos + 1) % active.length;
    loadTrack(active[nextPos], true);
  }

  function goPrev() {
    if (sound && sound.seek() > 3) {
      sound.seek(0);
      return;
    }
    const active = getActiveIndices();
    if (active.length === 0) return;
    if (shuffleOn) { loadTrack(drawShuffle(active), true); return; }
    const pos = active.indexOf(currentIndex);
    const prevPos = pos === -1 ? 0 : (pos - 1 + active.length) % active.length;
    loadTrack(active[prevPos], true);
  }

  let shuffleBag = [];

  function drawShuffle(active) {
    // Drop any tracks no longer in the active set (e.g. filter changed)
    shuffleBag = shuffleBag.filter(i => active.includes(i));

    if (shuffleBag.length === 0) {
      shuffleBag = [...active];
      // Fisher-Yates shuffle
      for (let i = shuffleBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffleBag[i], shuffleBag[j]] = [shuffleBag[j], shuffleBag[i]];
      }
      // Avoid the new bag starting with the song that just played
      if (shuffleBag.length > 1 && shuffleBag[0] === currentIndex) {
        [shuffleBag[0], shuffleBag[1]] = [shuffleBag[1], shuffleBag[0]];
      }
    }

    return shuffleBag.shift();
  }

  els.playBtn.addEventListener('click', () => {
    if (!sound) { loadTrack(0, true); return; }
    if (isPlaying) sound.pause(); else sound.play();
  });

  els.nextBtn.addEventListener('click', goNext);
  els.prevBtn.addEventListener('click', goPrev);

  els.shuffleBtn.addEventListener('click', () => {
    shuffleOn = !shuffleOn;
    els.shuffleBtn.classList.toggle('active', shuffleOn);
    els.shuffleBtn.setAttribute('aria-pressed', shuffleOn);
  });

  els.repeatBtn.addEventListener('click', () => {
    repeatOn = !repeatOn;
    els.repeatBtn.classList.toggle('active', repeatOn);
    els.repeatBtn.setAttribute('aria-pressed', repeatOn);
  });

  els.playerLikeBtn.addEventListener('click', () => {
    if (currentIndex === -1) return;
    toggleLike(currentIndex);
  });

  // View state is set up further below, after all view-related
  // elements and helper functions are defined.

  els.searchBox.addEventListener('input', () => {
    searchQuery = els.searchBox.value.trim().toLowerCase();
    renderPlaylist();
  });

  els.seek.addEventListener('input', () => {
    isSeeking = true;
    const val = parseFloat(els.seek.value);
    if (sound) sound.seek(val);
    els.curTime.textContent = fmtTime(val);
  });

  const stopSeeking = () => { isSeeking = false; };
  els.seek.addEventListener('change', stopSeeking);
  els.seek.addEventListener('mouseup', stopSeeking);
  els.seek.addEventListener('touchend', stopSeeking);

  function loadVolume() {
    try {
      const raw = localStorage.getItem('sahayo-volume');
      return raw !== null ? parseFloat(raw) : 0.8;
    } catch (e) { return 0.8; }
  }

  function saveVolume(v) {
    try { localStorage.setItem('sahayo-volume', v); } catch (e) { /* not persisted this session */ }
  }

  function setVolume(v) {
    Howler.volume(v);
    els.volumeSlider.value = v;
    els.volIconOn.style.display = v > 0 ? 'block' : 'none';
    els.volIconOff.style.display = v > 0 ? 'none' : 'block';
    els.volumeBtn.setAttribute('aria-label', v > 0 ? 'Mute' : 'Unmute');
    if (v > 0) lastVolume = v;
  }

  setVolume(loadVolume());

  els.volumeSlider.addEventListener('input', () => {
    const v = parseFloat(els.volumeSlider.value);
    setVolume(v);
    saveVolume(v);
  });

  els.volumeBtn.addEventListener('click', () => {
    const v = Howler.volume() > 0 ? 0 : (lastVolume || 0.8);
    setVolume(v);
    saveVolume(v);
  });

  // --- View system: Home / Lyrics / Liked -------------------------------
  // Three distinct, mutually-exclusive views. Entering Lyrics or Liked
  // adds a browser-history entry, so the phone's back button (or gesture)
  // returns to Home — same as tapping the on-screen Back button. Only
  // Home shows the Share/Lyrics/Liked buttons; the other two views show
  // a single, obvious Back button instead, so there's always exactly one
  // clear way to go back.
  let currentView = 'home'; // 'home' | 'lyrics' | 'liked'

  function applyView(view) {
    currentView = view;
    const isHome = view === 'home';
    const isLyrics = view === 'lyrics';
    const isLiked = view === 'liked';

    filterLikedOnly = isLiked;

    els.lyricsView.classList.toggle('view-hidden', !isLyrics);
    els.listView.classList.toggle('view-hidden', isLyrics);
    els.likedSubnote.classList.toggle('view-hidden', !isLiked);

    els.headerActions.classList.toggle('view-hidden', !isHome);
    els.viewBackBtn.classList.toggle('view-hidden', isHome);

    els.lyricsBtn.setAttribute('aria-pressed', isLyrics);
    els.likedFilterBtn.classList.toggle('active', isLiked);
    els.likedFilterBtn.setAttribute('aria-pressed', isLiked);

    els.playlistHeading.textContent = isLyrics ? 'Lyrics' : isLiked ? 'Liked Songs' : 'Playlist';

    if (isLyrics) refreshLyricsView();
    if (!isLyrics) renderPlaylist();
  }

  function goToView(view) {
    if (view === currentView) return;
    applyView(view);
    history.pushState({ view }, '', '#' + view);
  }

  function goHome() {
    if (currentView === 'home') return;
    if (history.state && history.state.view) {
      history.back(); // triggers popstate below, which does the actual switch
    } else {
      applyView('home');
    }
  }

  window.addEventListener('popstate', () => {
    if (currentView !== 'home') applyView('home');
  });

  els.viewBackBtn.addEventListener('click', goHome);

  els.likedFilterBtn.addEventListener('click', () => {
    goToView('liked');
  });

  function refreshLyricsView() {
    if (currentIndex === -1) return;
    const t = tracks[currentIndex];
    const text = (window.LYRICS && window.LYRICS[t.src.replace(/^audio\//, '')]) || '';
    els.lyricsSongTitle.textContent = t.title;
    els.lyricsSongArtist.textContent = t.artist;
    if (text.trim()) {
      els.lyricsBody.textContent = text;
      els.lyricsBody.classList.remove('empty');
    } else {
      els.lyricsBody.textContent = 'Lyrics haven\'t been added for this song yet.';
      els.lyricsBody.classList.add('empty');
    }
  }

  els.lyricsBtn.addEventListener('click', () => {
    if (currentIndex === -1) return;
    goToView('lyrics');
  });

  function getShareUrl(index) {
    const filename = tracks[index].src.replace(/^audio\//, '');
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('song', filename);
    return url.toString();
  }

  function flashShareLabel(msg) {
    els.shareLabel.textContent = msg;
    setTimeout(() => { els.shareLabel.textContent = 'Share'; }, 1800);
  }

  els.shareBtn.addEventListener('click', async () => {
    if (currentIndex === -1) return;
    const url = getShareUrl(currentIndex);
    const t = tracks[currentIndex];
    const shareData = { title: t.title, text: `Listen to "${t.title}" — ${t.artist}`, url };

    if (navigator.share) {
      try { await navigator.share(shareData); }
      catch (e) { /* user cancelled — no action needed */ }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        flashShareLabel('Link copied!');
      } catch (e) {
        flashShareLabel('Copy failed');
      }
    }
    els.shareBtn.blur();
  });

  renderPlaylist();

  const supportLink = document.getElementById('supportLink');
  if (window.SUPPORT_URL && window.SUPPORT_URL.trim()) {
    supportLink.href = window.SUPPORT_URL.trim();
    document.getElementById('supportLinkText').textContent = `Support ${window.ARTIST_NAME || ''}`.trim();
    supportLink.classList.remove('view-hidden');
  }

  // If this page was opened via a shared link (?song=filename.mp3),
  // load that track so it's ready to play.
  const sharedSong = new URLSearchParams(window.location.search).get('song');
  if (sharedSong) {
    const sharedIndex = tracks.findIndex(t => t.src.replace(/^audio\//, '') === sharedSong);
    if (sharedIndex !== -1) loadTrack(sharedIndex, false);
  }

  // Register the service worker so the app installs as a real PWA
  // with offline support, instead of just a manifest-only install.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* offline support just won't be available — the app still works online */
      });
    });
  }

  // Let people know when they've lost connection entirely, rather than
  // leaving them guessing why playback stopped working. Previously-played
  // songs still work fine offline thanks to the service worker's cache.
  function updateOfflineBanner() {
    els.offlineBanner.style.display = navigator.onLine ? 'none' : 'block';
  }
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  updateOfflineBanner();

  // Media Session API — this is what puts previous/next (and play/pause)
  // controls on the Android notification and lock screen, instead of
  // just a bare play/pause with no way to skip tracks.
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => { if (sound) sound.play(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (sound) sound.pause(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => goPrev());
    navigator.mediaSession.setActionHandler('nexttrack', () => goNext());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (sound && details.seekTime != null) {
        sound.seek(details.seekTime);
        els.seek.value = details.seekTime;
        els.curTime.textContent = fmtTime(details.seekTime);
      }
    });
  }

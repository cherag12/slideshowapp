downloadBtn.addEventListener('click', async ()=> {
  if (!photos.length) return alert('No photo to download');
  const p = photos[currentIndex];

  // load main photo
  let img;
  try {
    img = await loadImage(p.src);
  } catch(err){
    return alert('Failed to load image for download.');
  }

  // canvas sizing (limit max dimension)
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const maxDim = 2000;
  const scale = Math.min(1, maxDim / Math.max(W,H));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');

  // draw background + image (respect fitMode)
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  if (fitMode.value === 'cover') {
    const r = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const w = img.naturalWidth * r, h = img.naturalHeight * r;
    ctx.drawImage(img, (canvas.width - w)/2, (canvas.height - h)/2, w, h);
  } else {
    const r = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const w = img.naturalWidth * r, h = img.naturalHeight * r;
    ctx.drawImage(img, (canvas.width - w)/2, (canvas.height - h)/2, w, h);
  }

  // prepare overlay sizes (scaled)
  const pad = 18 * (canvas.width / 1000);
  const smallMapW = Math.min(300, Math.round(canvas.width * 0.22));
  const smallMapH = Math.round(smallMapW * 0.66);
  const boxW = Math.min(canvas.width*0.46, 420*(canvas.width/1000));
  const boxH = 140*(canvas.height/600);
  const bx = canvas.width - pad - boxW;
  const by = canvas.height - pad - boxH;

  // TRY to fetch static map if userLocation present
  let mapLoaded = false;
  if (userLocation) {
    // Use the API key provided by user
    const key = 'we have used are private google key';
    const center = encodeURIComponent(userLocation);
    // choose a zoom appropriate for city-level; you can adjust zoom param if required
    const zoom = 12;
    // size: clamp to static map limits (max 640x640 for free)
    const mapSizeW = Math.min(smallMapW, 640);
    const mapSizeH = Math.min(smallMapH, 640);
    const mapURL = `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=${zoom}&size=${mapSizeW}x${mapSizeH}&maptype=roadmap&markers=color:red%7C${center}&scale=2&key=${key}`;

    try {
      const mapImg = await loadImage(mapURL);
      // draw map bottom-left with a subtle rounded border
      const mx = pad;
      const my = canvas.height - pad - mapSizeH;
      // background panel for map
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(ctx, mx-6, my-6, mapSizeW+12, mapSizeH+12, 10, true, false);
      ctx.drawImage(mapImg, mx, my, mapSizeW, mapSizeH);
      mapLoaded = true;
    } catch(e) {
      // fallback: leave mapLoaded false; we'll display location text instead
      console.warn('Static map load failed', e);
      mapLoaded = false;
    }
  }

  // Draw overlay (bottom-right)
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, bx, by, boxW, boxH, 12*(canvas.width/1000), true, false);

  // text overlay content
  ctx.fillStyle = '#e9f2ff';
  const baseFont = Math.max(12, Math.round(14*(canvas.width/1000)));
  ctx.font = `${baseFont}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // compute date/time/day strings
  let dateStr = '-', timeStr='-', dayStr='-';
  if (p.date) {
    // if time provided, combine; else treat as date only
    try {
      const dt = new Date(p.date + (p.time ? ('T' + p.time) : ''));
      if (!isNaN(dt.getTime())) {
        dateStr = dt.toLocaleDateString();
        timeStr = p.time ? p.time : dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        dayStr = dt.toLocaleString(undefined, {weekday:'long'});
      }
    } catch(_) {}
  } else if (p.time) {
    timeStr = p.time;
  }

  const lines = [
    `Date: ${dateStr}`,
    `Time: ${timeStr}   Day: ${dayStr}`,
    `Place: ${userLocation || 'Not set'}`,
    `Direction: ${getDirectionText() || '-'}`,
    `Altitude: ${currentAltitude ? currentAltitude + 'm' : 'N/A'}   Speed: ${currentSpeed ? currentSpeed + ' m/s' : 'N/A'}`,
    `Index: ${currentIndex+1} / ${photos.length}`
  ];

  const lineHeight = Math.max(18, Math.round(baseFont * 1.25));
  lines.forEach((ln, i) => {
    ctx.fillText(ln, bx + 14*(canvas.width/1000), by + 18*(canvas.width/1000) + i * lineHeight);
  });

  // Draw compass (circle + needle + N)
  const compassSize = Math.round(72 * (canvas.width/1000));
  const cx = Math.round(bx - 16*(canvas.width/1000) - compassSize);
  const cy = by + boxH - compassSize - 8*(canvas.width/1000);

  // Outer circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx + compassSize/2, cy + compassSize/2, compassSize/2, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fill();
  ctx.lineWidth = Math.max(2, Math.round(2*(canvas.width/1000)));
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.stroke();
  ctx.restore();

  // Needle (rotate according to heading)
  const headingDeg = getHeadingDegrees() || 0;
  ctx.save();
  ctx.translate(cx + compassSize/2, cy + compassSize/2);
  ctx.rotate((headingDeg) * Math.PI/180); // heading degrees -> rotate needle
  // needle
  ctx.beginPath();
  ctx.moveTo(0, -compassSize*0.36);
  ctx.lineTo(compassSize*0.14, compassSize*0.22);
  ctx.lineTo(-compassSize*0.14, compassSize*0.22);
  ctx.closePath();
  ctx.fillStyle = '#2f9cff';
  ctx.fill();
  ctx.restore();

  // draw "N" label near compass top
  ctx.fillStyle = '#e6eef8';
  ctx.font = `${Math.max(10, Math.round(baseFont*0.9))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('N', cx + compassSize/2, cy + 12);

  // If map not loaded, write a fallback short map-text overlay in bottom-left
  if (!mapLoaded) {
    if (userLocation) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const tx = pad;
      const ty = canvas.height - pad - 60;
      const tw = Math.min(320, Math.round(canvas.width*0.3));
      roundRect(ctx, tx-8, ty-8, tw+16, 60+16, 10, true, false);
      ctx.fillStyle = '#e9f2ff';
      ctx.textAlign = 'left';
      ctx.font = `${Math.max(12, Math.round(baseFont*0.9))}px sans-serif`;
      ctx.fillText('Map snapshot unavailable', tx+6, ty+18);
      ctx.fillText(userLocation, tx+6, ty+40);
    }
  }

  // Finalize download
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `slide_${(currentIndex+1)}.png`;
  a.click();
});


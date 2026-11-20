/* 圖片處理：把使用者選的圖片縮小並壓縮成一段小小的資料（data URL），直接存進角色資料。
   原圖可能好幾 MB，直接存會很快把瀏覽器的儲存空間（約 5 MB）用完，所以先縮小再存。 */
const ImageUtil = (() => {
  const MAX_FILE_BYTES = 15 * 1024 * 1024; // 超過這個大小的檔案不處理
  const MAX_RESULT_CHARS = 300 * 1024; // 縮完還超過就再縮小（約 220 KB 的圖）

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('無法讀取這張圖片，請換一個檔案'));
      };
      img.src = url;
    });
  }

  // 畫到畫布上輸出。WebP 檔案小又能保留透明；瀏覽器不支援輸出 WebP 時改用 JPEG（先鋪白底，避免透明變黑）
  function render(img, maxSide, quality) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', quality);
    if (webp.startsWith('data:image/webp')) return webp;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  // 回傳縮小後的 data URL；檔案不是圖片或太大時丟出可以直接顯示給使用者的錯誤
  async function fileToDataUrl(file, { maxSide = 400, quality = 0.85 } = {}) {
    if (!file || !String(file.type).startsWith('image/')) throw new Error('請選擇圖片檔（jpg、png、webp、gif 等）');
    if (file.size > MAX_FILE_BYTES) throw new Error('圖片檔太大（上限 15 MB），請先縮小再上傳');
    const img = await loadImage(file);
    let out = render(img, maxSide, quality);
    for (let tries = 0; out.length > MAX_RESULT_CHARS && tries < 4; tries++) {
      maxSide = Math.round(maxSide * 0.8);
      quality = Math.max(0.5, quality - 0.1);
      out = render(img, maxSide, quality);
    }
    return out;
  }

  return { fileToDataUrl };
})();

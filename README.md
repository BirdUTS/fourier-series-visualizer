# FFT 魔法 · Fourier Magic

一個 **純前端、零安裝** 嘅手機 **教學** web app，用你部電話一邊玩特效、一邊睇住背後嘅數學原理，親手感受傅立葉變換 (Fourier Transform / FFT) 嘅神奇。打開個網址即玩，全部支援觸控。

> An interactive, install-free, mobile-first **teaching** web app: see the magic *and* the math behind it, live, right on your phone.

每個 demo 下面都有一張 **「📐 背後嘅數學」卡片**，顯示真正嘅公式，並且跟住你嘅操作 **即時更新數值**——例如畫圖時話你知最大旋轉向量嘅半徑同頻率、合成方波時話你知啱啱加咗第幾個諧波同佢嘅振幅。

## 四個 Demo（由淺入深）

| Demo | 學到咩 | 用到嘅 FFT 概念 |
|---|---|---|
| 🧱 **頻率積木** | 時域 ↔ 頻域**雙視窗**：加正弦波、拖頻率/振幅 slider，睇住「複雜嘅波 = 幾條簡單嘅頻譜柱」。FFT 概念命根 | 合成（FFT 嘅相反） |
| 🎤 **聲音頻譜 + 濾波** | 對住咪哼歌/吹口哨睇主頻率同音符；開低通/高通，喺頻譜上拖手指切走某段頻率，仲可試聽 | `AnalyserNode` 即時 FFT + `BiquadFilter` |
| ✍️ **畫圖向量** | 手指畫形狀，**逐個向量疊加**睇個圖一層層砌出嚟，每步顯示嗰個頻率同半徑 | 自寫離散傅立葉變換 (DFT) |
| 🎵 **方波合成** | 拖 slider 逐個加奇次諧波，**同時聽到**聲音由純正弦音變成方波 | Web Audio `PeriodicWave` |

每個 demo 頂部有 **🧭 引導步驟**，用一句話帶完全唔識嘅人一步步睇住邊度、試拖邊個掣。

## 點樣用

直接喺手機（或電腦）瀏覽器打開 `index.html` 就得，唔使裝任何嘢、唔使 build。

```bash
# 本地快速開一個 server（任選其一）
python3 -m http.server 8000
# 然後喺瀏覽器開 http://localhost:8000
```

亦可以直接 deploy 上 **GitHub Pages**（Settings → Pages → 揀 branch），用手機開個網址即玩。

> 💡 聲音頻譜需要麥克風權限；部份瀏覽器要 HTTPS（或 localhost）先准許存取咪。所有處理都喺你部電話本機進行，數據唔會上傳。

## 技術

- 純 HTML / CSS / 原生 JavaScript，無任何依賴、無 build step
- Mobile-first 響應式設計，retina 螢幕清晰（`devicePixelRatio` 縮放）
- Web Audio API（即時 FFT 同聲音合成）+ Canvas 2D

## 原理簡介

傅立葉嘅核心思想：**任何訊號都可以拆成一堆簡單正弦波（不同頻率、振幅、相位）嘅疊加。**

- *聲音頻譜* 展示「分析」方向：FFT 即時計出你把聲含有邊啲頻率。
- *畫圖向量* 將二維路徑當成複數序列做 DFT，每個係數對應一個以固定速度旋轉嘅向量；接力相加就重畫返你嘅圖。向量越多越似原圖。
- *方波合成* 展示「合成」方向：一個方波等於無限多奇次諧波正弦波之和，逐個加上去就越來越似方波（同時聽得到音色變化）。

## License

MIT

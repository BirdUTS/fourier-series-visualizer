# Fourier Series Visualizer

An interactive visualization tool that demonstrates how Fourier Series can decompose any drawing into a sum of rotating vectors. Draw any shape and watch it being reconstructed using Fourier transforms!

## Features

- Interactive drawing interface
- Real-time Fourier transform visualization
- Adjustable number of Fourier terms (1-100)
- Visual representation of epicycles
- Smooth animation of the reconstruction process

## Requirements

- Python 3.6+
- pygame
- numpy

## Installation

1. Clone the repository:
```bash
git clone https://github.com/BirdUTS/fourier-series-visualizer.git
cd fourier-series-visualizer
```

2. Install the required packages:
```bash
pip install -r requirements.txt
```

## Usage

Run the program:
```bash
python fourier_draw.py
```

### Controls:
- Left mouse button: Draw
- ENTER: Start animation
- C: Clear drawing
- Slider: Adjust number of Fourier terms
- Close window or Q: Quit

## How It Works

The program uses the Fast Fourier Transform (FFT) to decompose your drawing into a sum of rotating vectors. Each vector rotates at a different frequency, and when combined, they recreate your original drawing. The more terms you include (adjusted by the slider), the more accurate the reproduction becomes.

1. Drawing Phase:
   - Your drawing is captured as a series of points
   - Points are converted to complex numbers for FFT processing

2. Animation Phase:
   - The FFT coefficients are calculated
   - Epicycles (rotating vectors) are drawn in order of importance
   - The path is traced by the sum of all vectors

## Contributing

Feel free to open issues or submit pull requests if you have suggestions for improvements!

## License

This project is licensed under the MIT License - see the LICENSE file for details.
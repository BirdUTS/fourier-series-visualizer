import pygame
import numpy as np
import sys
from pygame import gfxdraw

# Initialize Pygame
pygame.init()
screen = pygame.display.set_mode((1200, 800))
pygame.display.set_caption("Fourier Series Drawing")

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
RED = (255, 0, 0)
BLUE = (0, 0, 255)
GREEN = (0, 255, 0)

# States
DRAWING = 0
ANIMATING = 1
current_state = DRAWING

# Drawing variables
drawing_points = []
fourier_coeffs = []
time = 0
num_coeffs = 50  # Initial number of coefficients to use
slider_rect = pygame.Rect(50, 750, 300, 20)
slider_button_rect = pygame.Rect(50, 745, 10, 30)
dragging_slider = False

def calculate_fourier_coefficients(points):
    if len(points) < 2:
        return []
    
    # Convert points to complex numbers
    complex_points = [complex(x - 600, -(y - 400)) for x, y in points]
    
    # Perform FFT
    coeffs = np.fft.fft(complex_points)
    
    # Sort coefficients by magnitude
    freq_indices = list(range(-len(coeffs)//2, len(coeffs)//2))
    coeffs = np.fft.fftshift(coeffs)
    
    # Create list of (frequency, coefficient) pairs
    fourier_pairs = list(zip(freq_indices, coeffs))
    fourier_pairs.sort(key=lambda x: abs(x[1]), reverse=True)
    
    return fourier_pairs

def draw_epicycles(t, coeffs, num_terms):
    x, y = 600, 400  # Center point
    prev_x, prev_y = x, y
    
    for i in range(min(num_terms, len(coeffs))):
        freq, coeff = coeffs[i]
        radius = abs(coeff) / len(drawing_points)
        angle = 2 * np.pi * freq * t + np.angle(coeff)
        
        x += radius * np.cos(angle)
        y -= radius * np.sin(angle)
        
        # Draw circle
        pygame.draw.circle(screen, WHITE, (int(prev_x), int(prev_y)), int(radius), 1)
        # Draw line from center to edge
        pygame.draw.line(screen, BLUE, (int(prev_x), int(prev_y)), (int(x), int(y)), 1)
        
        prev_x, prev_y = x, y
    
    return x, y

def draw_slider():
    pygame.draw.rect(screen, WHITE, slider_rect, 1)
    slider_button_rect.x = 50 + (num_coeffs / 100) * (slider_rect.width - slider_button_rect.width)
    pygame.draw.rect(screen, WHITE, slider_button_rect)
    
    # Draw text
    font = pygame.font.Font(None, 24)
    text = font.render(f"Number of terms: {num_coeffs}", True, WHITE)
    screen.blit(text, (50, 720))

# Main loop
running = True
path_points = []

while running:
    screen.fill(BLACK)
    
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        
        elif event.type == pygame.MOUSEBUTTONDOWN:
            if event.button == 1:
                if slider_button_rect.collidepoint(event.pos):
                    dragging_slider = True
                elif current_state == DRAWING:
                    drawing_points.append(event.pos)
        
        elif event.type == pygame.MOUSEBUTTONUP:
            if event.button == 1:
                dragging_slider = False
        
        elif event.type == pygame.MOUSEMOTION:
            if dragging_slider:
                rel_x = min(max(event.pos[0], slider_rect.left), slider_rect.right - slider_button_rect.width)
                num_coeffs = int((rel_x - slider_rect.left) / (slider_rect.width - slider_button_rect.width) * 100)
                num_coeffs = max(1, min(100, num_coeffs))
            elif current_state == DRAWING and pygame.mouse.get_pressed()[0]:
                drawing_points.append(event.pos)
        
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_RETURN and current_state == DRAWING:
                if len(drawing_points) > 1:
                    fourier_coeffs = calculate_fourier_coefficients(drawing_points)
                    current_state = ANIMATING
                    path_points = []
                    time = 0
            elif event.key == pygame.K_c:  # Clear drawing
                drawing_points = []
                path_points = []
                current_state = DRAWING
                time = 0
    
    # Draw the current state
    if current_state == DRAWING:
        if len(drawing_points) > 1:
            pygame.draw.lines(screen, WHITE, False, drawing_points)
    else:  # ANIMATING
        if len(fourier_coeffs) > 0:
            x, y = draw_epicycles(time, fourier_coeffs, num_coeffs)
            path_points.append((int(x), int(y)))
            if len(path_points) > 1:
                pygame.draw.lines(screen, GREEN, False, path_points)
            time += 1 / len(drawing_points)
            if time >= 1:
                time = 0
                path_points = []
    
    # Draw slider
    draw_slider()
    
    # Draw instructions
    font = pygame.font.Font(None, 24)
    instructions = [
        "Draw with left mouse button",
        "Press ENTER to start animation",
        "Press C to clear",
        "Adjust slider to change number of terms"
    ]
    for i, text in enumerate(instructions):
        surface = font.render(text, True, WHITE)
        screen.blit(surface, (850, 50 + i * 30))
    
    pygame.display.flip()

pygame.quit()
sys.exit()
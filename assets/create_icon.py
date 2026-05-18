from PIL import Image, ImageDraw, ImageFont
import os

# 512x512の赤い円アイコンを作成
sizes = [16, 32, 64, 128, 256, 512, 1024]
for size in sizes:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 赤い円を描画
    margin = size // 10
    draw.ellipse([margin, margin, size - margin, size - margin], fill='#e53935')
    # CCテキスト
    try:
        font_size = size // 3
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', font_size)
    except:
        font = ImageFont.load_default()
    text = "CC"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - size // 10
    draw.text((x, y), text, fill='white', font=font)
    img.save(f'icon_{size}.png')
    if size == 512:
        img.save('icon.png')

print("Icons created!")

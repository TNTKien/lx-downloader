# lx-downloader

CLI tải truyện từ `https://lxmanga.space`.

## Installation

Cài Bun: https://bun.com/docs/installation


## Usage

```bash
bun install
```

then

```bash
bun run src/cli.ts
```

Hoặc gắn link trực tiếp:

```bash
bun run src/cli.ts "https://lxmanga.space/truyen/he-thong-nhiem-vu-cay-gai-cuu-dao-truong-pha-san"
bun run src/cli.ts "https://lxmanga.space/truyen/he-thong-nhiem-vu-cay-gai-cuu-dao-truong-pha-san/chap-12"
```

## Tùy chọn

```bash
bun run src/cli.ts <url> --output downloaded --archive none --concurrency 4 --token lx-downloader
```

- `--archive none|chapter|story|both`: nén chapter, truyện, hoặc cả hai
- `--output`: thư mục gốc, mặc định là `downloaded`
- `--token`: giá trị header `Token` khi tải ảnh
- `--concurrency`: số ảnh tải song song

## Build executable file

```bash
bun run build
```
then run `lx-downloader.exe` in dist folder.
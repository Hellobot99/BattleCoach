# EC2에 배포하기

배틀 코치는 Node 서버 하나(배틀 시뮬레이터 + 평가기 + 화면)와 그 앞의 Caddy(HTTPS)로 돌아요. 둘 다 Docker로 띄웁니다.

## 1. 인스턴스 만들기

| 항목 | 값 |
| --- | --- |
| AMI | Amazon Linux 2023 |
| 인스턴스 유형 | **t3.small** (2 vCPU · 2GB) 이상. Arm을 고르면 **t4g.small**도 같음 |
| 키 페어 | 새로 만들기 (RSA, .pem). 받은 파일은 다시 받을 수 없으니 잘 보관 |
| 방화벽 | SSH는 **내 IP**만, **HTTP · HTTPS 허용** |
| 스토리지 | 20GiB gp3 |

**t3.micro(1GB)는 권장하지 않아요.** 2 vCPU · 1GB 환경에서 재 보니 메모리가 한도(1GB)에 꽉 찼어요. 평가 워커마다 쇼다운 시뮬레이터를 따로 불러오기 때문이에요.

**t3 · t4g는 CPU 크레딧 방식이에요.** 평소에는 CPU를 조금만 쓰다가 배틀 중에만 2코어를 꽉 씁니다. 사람이 적으면 크레딧으로 충분하지만, 계속 많이 쓰면 「무제한」 모드에서는 추가 요금이, 「표준」 모드에서는 속도 저하가 생겨요.

인스턴스를 만든 뒤 **탄력적 IP**를 하나 할당해 연결해 두면, 인스턴스를 껐다 켜도 주소가 바뀌지 않아요.

## 2. 접속과 준비

```bash
chmod 400 battle-coach.pem
ssh -i battle-coach.pem ec2-user@<퍼블릭 IP>
```

서버에서:

```bash
# Docker와 git
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

# docker compose 플러그인
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# 메모리 여유용 스왑 2GB (2GB 인스턴스에서 이미지 빌드할 때도 도움이 돼요)
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab

exit   # docker 그룹을 적용하려고 한 번 나갔다가 다시 접속
```

## 3. 실행

```bash
ssh -i battle-coach.pem ec2-user@<퍼블릭 IP>
git clone https://github.com/Hellobot99/BattleCoach.git
cd BattleCoach
cp .env.example .env
nano .env          # SITE_ADDRESS 등 수정 (아래 참고)
docker compose up -d --build
```

처음 빌드는 2코어 서버에서 몇 분 걸려요. 끝나면 브라우저에서 `http://<퍼블릭 IP>` 를 엽니다.

### 주소와 HTTPS (`.env`의 `SITE_ADDRESS`)

| 값 | 결과 |
| --- | --- |
| `:80` (기본) | `http://<IP>` 로 열림. HTTPS 없음 |
| `<IP>.sslip.io` (예: `3.35.10.20.sslip.io`) | 도메인 없이 HTTPS. sslip.io가 IP로 연결해 주고 Caddy가 인증서를 자동으로 받아요 |
| 내 도메인 (예: `coach.example.com`) | 도메인의 A 레코드를 탄력적 IP로 연결하면 HTTPS가 자동으로 붙어요 |

`SITE_ADDRESS`를 바꾼 뒤에는 `docker compose up -d` 로 다시 띄웁니다.

### 평가 속도 (`.env`의 `EVAL_*`)

2 vCPU · 2GB에서 잰 한 턴 평가 시간이에요 (M4 Mac의 Docker로 CPU를 2개로 묶어 쟀고, 실제 t3 코어는 1.5 ~ 2배쯤 느려요).

| 설정 (`EVAL_PHASE1` / `PHASE2` / `WORLDS`) | 평균 | 최대 |
| --- | --- | --- |
| 기본 24 / 72 / 12 | 5.5 ~ 6초 | 13초 |
| **12 / 28 / 8 (권장, `.env.example` 기본값)** | 약 2.2초 | 7.5초 |
| 8 / 16 / 6 | 약 1.4초 | 4.8초 |

숫자를 줄이면 빨라지지만 등급이 조금 더 흔들려요. 더 빠르게 하려면 vCPU가 많은 인스턴스(예: 4 vCPU)를 쓰고 기본값으로 돌리면 돼요.

### 그 밖의 설정

- `GAMES_PER_HOUR` — 한 주소가 한 시간에 시작할 수 있는 배틀 수 (기본 30, 0이면 제한 없음)
- 배틀 종료 음악: 서버의 `BattleCoach/public/audio/` 에 `victory.mp3` / `defeat.mp3` 를 넣으면 재생돼요 (git에는 안 올라가요)

## 4. 관리

```bash
cd BattleCoach
git pull && docker compose up -d --build   # 새 버전으로 업데이트
docker compose logs -f app                 # 로그 보기
docker compose restart app                 # 다시 시작
docker compose down                        # 끄기
```

진행 중인 배틀은 서버 메모리에만 있어서, 업데이트하거나 다시 시작하면 그때 하던 배틀은 사라져요. 퍼즐 진행(별)은 각자 브라우저에 저장되니 남아요.

# CompTIA Security+ (SY0-701) Mock Exam

**Time allowed:** 90 minutes  
**Questions:** 90 (5 performance-based, 85 multiple choice)  
**Passing score:** 750 on a 100 to 900 scale (83 of 102 points in this mock)

## What is in this file

| Part | Contents | Who |
|---|---|---|
| Part 1 | Performance-based questions (PBQs) | Candidate, timed |
| Part 2 | 85 multiple-choice questions | Candidate, timed |
| Part 3 | Answer sheet | Candidate fills in |
| Part 4 | Retake PBQs (version B, new values) | Candidate, second sitting |
| Part 5 | Hands-on terminal lab on your own Linux machine | Candidate, practice |
| Part 6 | Proctor pack: pacing guide, answer keys, domain scoring, oral questions | Proctor only |

## Instructions for the candidate

- Your proctor sets a 90-minute timer. No notes, no searching, phone away.
- Do the PBQs first, as on the real exam. You may skip and come back.
- Write answers in the Part 3 answer sheet. Do not scroll past Part 5.
- For PBQs, also write the command you would type to get each answer.
- 'Choose TWO' questions only score if both answers are correct.
- Every question is worth 1 point and every PBQ part is worth 1 point: 102 points in total.

> **Proctor:** everything you need is in Part 6 at the end of the file. Keep it hidden until the candidate finishes.

---

# Part 1: Performance-based questions

## PBQ 1. Investigate an SSH brute-force alert (3 points)

A SIEM alert for repeated SSH login failures fired on `web01`. Below is `/var/log/auth.log`.

```text
analyst@web01:~$ cat /var/log/auth.log
Nov  3 01:48:37 web01 CRON[1834]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 01:54:17 web01 sshd[1843]: Accepted publickey for adaeze from 10.0.2.15 port 34007 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 01:54:18 web01 sshd[1844]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
Nov  3 01:55:09 web01 CRON[1835]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 01:58:00 web01 sshd[1851]: Invalid user test from 45.155.205.233 port 39663
Nov  3 01:58:01 web01 sshd[1852]: Failed password for invalid user test from 45.155.205.233 port 39663 ssh2
Nov  3 01:58:07 web01 sshd[1853]: Invalid user ftpuser from 45.155.205.233 port 62977
Nov  3 01:58:08 web01 sshd[1854]: Failed password for invalid user ftpuser from 45.155.205.233 port 62977 ssh2
Nov  3 01:58:14 web01 sshd[1855]: Invalid user test from 45.155.205.233 port 39593
Nov  3 01:58:15 web01 sshd[1856]: Failed password for invalid user test from 45.155.205.233 port 39593 ssh2
Nov  3 01:58:19 web01 sshd[1857]: Invalid user test from 45.155.205.233 port 53232
Nov  3 01:58:20 web01 sshd[1858]: Failed password for invalid user test from 45.155.205.233 port 53232 ssh2
Nov  3 01:58:27 web01 sshd[1859]: Invalid user test from 45.155.205.233 port 62152
Nov  3 01:58:28 web01 sshd[1860]: Failed password for invalid user test from 45.155.205.233 port 62152 ssh2
Nov  3 01:58:30 web01 sshd[1861]: Invalid user admin from 45.155.205.233 port 41738
Nov  3 01:58:31 web01 sshd[1862]: Failed password for invalid user admin from 45.155.205.233 port 41738 ssh2
Nov  3 01:58:37 web01 sshd[1863]: Invalid user pi from 45.155.205.233 port 43821
Nov  3 01:58:38 web01 sshd[1864]: Failed password for invalid user pi from 45.155.205.233 port 43821 ssh2
Nov  3 01:58:45 web01 sshd[1865]: Invalid user pi from 45.155.205.233 port 52021
Nov  3 01:58:46 web01 sshd[1866]: Failed password for invalid user pi from 45.155.205.233 port 52021 ssh2
Nov  3 01:58:50 web01 sshd[1867]: Invalid user admin from 45.155.205.233 port 64753
Nov  3 01:58:51 web01 sshd[1868]: Failed password for invalid user admin from 45.155.205.233 port 64753 ssh2
Nov  3 01:58:54 web01 sshd[1869]: Invalid user ftpuser from 45.155.205.233 port 59084
Nov  3 01:58:55 web01 sshd[1870]: Failed password for invalid user ftpuser from 45.155.205.233 port 59084 ssh2
Nov  3 01:58:58 web01 sshd[1871]: Invalid user guest from 45.155.205.233 port 36209
Nov  3 01:58:59 web01 sshd[1872]: Failed password for invalid user guest from 45.155.205.233 port 36209 ssh2
Nov  3 01:59:06 web01 sshd[1873]: Invalid user user from 45.155.205.233 port 60439
Nov  3 01:59:07 web01 sshd[1874]: Failed password for invalid user user from 45.155.205.233 port 60439 ssh2
Nov  3 02:02:13 web01 CRON[1836]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:03:35 web01 sshd[1875]: Failed password for chidi from 102.89.34.12 port 46161 ssh2
Nov  3 02:03:48 web01 sshd[1876]: Failed password for chidi from 102.89.34.12 port 57625 ssh2
Nov  3 02:04:03 web01 sshd[1877]: Accepted password for chidi from 102.89.34.12 port 50167 ssh2
Nov  3 02:09:40 web01 CRON[1837]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:11:55 web01 sshd[1845]: Accepted publickey for adaeze from 10.0.2.15 port 41587 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 02:11:56 web01 sshd[1846]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
Nov  3 02:13:00 web01 sshd[1878]: Failed password for backup from 193.32.162.71 port 43069 ssh2
Nov  3 02:13:02 web01 sshd[1879]: Invalid user admin from 193.32.162.71 port 32797
Nov  3 02:13:03 web01 sshd[1880]: Failed password for invalid user admin from 193.32.162.71 port 32797 ssh2
Nov  3 02:13:08 web01 sshd[1881]: Failed password for backup from 193.32.162.71 port 36077 ssh2
Nov  3 02:13:10 web01 sshd[1882]: Invalid user oracle from 193.32.162.71 port 50606
Nov  3 02:13:11 web01 sshd[1883]: Failed password for invalid user oracle from 193.32.162.71 port 50606 ssh2
Nov  3 02:13:13 web01 sshd[1884]: Failed password for backup from 193.32.162.71 port 61467 ssh2
Nov  3 02:13:15 web01 sshd[1885]: Failed password for backup from 193.32.162.71 port 51675 ssh2
Nov  3 02:13:21 web01 sshd[1886]: Invalid user admin from 193.32.162.71 port 50936
Nov  3 02:13:22 web01 sshd[1887]: Failed password for invalid user admin from 193.32.162.71 port 50936 ssh2
Nov  3 02:13:25 web01 sshd[1888]: Failed password for root from 193.32.162.71 port 61886 ssh2
Nov  3 02:13:31 web01 sshd[1889]: Failed password for backup from 193.32.162.71 port 57718 ssh2
Nov  3 02:13:33 web01 sshd[1890]: Failed password for backup from 193.32.162.71 port 62756 ssh2
Nov  3 02:13:37 web01 sshd[1891]: Invalid user oracle from 193.32.162.71 port 30033
Nov  3 02:13:38 web01 sshd[1892]: Failed password for invalid user oracle from 193.32.162.71 port 30033 ssh2
Nov  3 02:13:40 web01 sshd[1893]: Invalid user postgres from 193.32.162.71 port 62039
Nov  3 02:13:41 web01 sshd[1894]: Failed password for invalid user postgres from 193.32.162.71 port 62039 ssh2
Nov  3 02:13:44 web01 sshd[1895]: Invalid user admin from 193.32.162.71 port 33408
Nov  3 02:13:45 web01 sshd[1896]: Failed password for invalid user admin from 193.32.162.71 port 33408 ssh2
Nov  3 02:13:48 web01 sshd[1897]: Failed password for backup from 193.32.162.71 port 59475 ssh2
Nov  3 02:13:51 web01 sshd[1898]: Invalid user ubuntu from 193.32.162.71 port 54887
Nov  3 02:13:52 web01 sshd[1899]: Failed password for invalid user ubuntu from 193.32.162.71 port 54887 ssh2
Nov  3 02:13:57 web01 sshd[1900]: Invalid user admin from 193.32.162.71 port 51076
Nov  3 02:13:58 web01 sshd[1901]: Failed password for invalid user admin from 193.32.162.71 port 51076 ssh2
Nov  3 02:14:03 web01 sshd[1902]: Failed password for root from 193.32.162.71 port 49314 ssh2
Nov  3 02:14:05 web01 sshd[1903]: Invalid user test from 193.32.162.71 port 51177
Nov  3 02:14:06 web01 sshd[1904]: Failed password for invalid user test from 193.32.162.71 port 51177 ssh2
Nov  3 02:14:08 web01 sshd[1905]: Invalid user admin from 193.32.162.71 port 41217
Nov  3 02:14:09 web01 sshd[1906]: Failed password for invalid user admin from 193.32.162.71 port 41217 ssh2
Nov  3 02:14:10 web01 sshd[1907]: Failed password for backup from 193.32.162.71 port 42797 ssh2
Nov  3 02:14:12 web01 sshd[1908]: Invalid user ubuntu from 193.32.162.71 port 42751
Nov  3 02:14:13 web01 sshd[1909]: Failed password for invalid user ubuntu from 193.32.162.71 port 42751 ssh2
Nov  3 02:14:18 web01 sshd[1910]: Invalid user postgres from 193.32.162.71 port 52396
Nov  3 02:14:19 web01 sshd[1911]: Failed password for invalid user postgres from 193.32.162.71 port 52396 ssh2
Nov  3 02:14:23 web01 sshd[1912]: Invalid user ubuntu from 193.32.162.71 port 38717
Nov  3 02:14:24 web01 sshd[1913]: Failed password for invalid user ubuntu from 193.32.162.71 port 38717 ssh2
Nov  3 02:14:27 web01 sshd[1914]: Invalid user admin from 193.32.162.71 port 31929
Nov  3 02:14:28 web01 sshd[1915]: Failed password for invalid user admin from 193.32.162.71 port 31929 ssh2
Nov  3 02:14:29 web01 sshd[1916]: Failed password for backup from 193.32.162.71 port 34844 ssh2
Nov  3 02:14:35 web01 sshd[1917]: Failed password for backup from 193.32.162.71 port 33811 ssh2
Nov  3 02:14:37 web01 sshd[1918]: Invalid user admin from 193.32.162.71 port 41027
Nov  3 02:14:38 web01 sshd[1919]: Failed password for invalid user admin from 193.32.162.71 port 41027 ssh2
Nov  3 02:14:43 web01 sshd[1920]: Failed password for root from 193.32.162.71 port 39812 ssh2
Nov  3 02:14:45 web01 sshd[1921]: Invalid user test from 193.32.162.71 port 50239
Nov  3 02:14:46 web01 sshd[1922]: Failed password for invalid user test from 193.32.162.71 port 50239 ssh2
Nov  3 02:14:51 web01 sshd[1923]: Invalid user ubuntu from 193.32.162.71 port 47984
Nov  3 02:14:52 web01 sshd[1924]: Failed password for invalid user ubuntu from 193.32.162.71 port 47984 ssh2
Nov  3 02:14:55 web01 sshd[1925]: Invalid user test from 193.32.162.71 port 60638
Nov  3 02:14:56 web01 sshd[1926]: Failed password for invalid user test from 193.32.162.71 port 60638 ssh2
Nov  3 02:14:59 web01 sshd[1927]: Invalid user ubuntu from 193.32.162.71 port 52936
Nov  3 02:15:00 web01 sshd[1928]: Failed password for invalid user ubuntu from 193.32.162.71 port 52936 ssh2
Nov  3 02:15:04 web01 sshd[1929]: Failed password for root from 193.32.162.71 port 41771 ssh2
Nov  3 02:15:08 web01 sshd[1930]: Invalid user ubuntu from 193.32.162.71 port 34329
Nov  3 02:15:09 web01 sshd[1931]: Failed password for invalid user ubuntu from 193.32.162.71 port 34329 ssh2
Nov  3 02:15:10 web01 sshd[1932]: Invalid user ubuntu from 193.32.162.71 port 32466
Nov  3 02:15:11 web01 sshd[1933]: Failed password for invalid user ubuntu from 193.32.162.71 port 32466 ssh2
Nov  3 02:15:14 web01 sshd[1934]: Invalid user oracle from 193.32.162.71 port 35984
Nov  3 02:15:15 web01 sshd[1935]: Failed password for invalid user oracle from 193.32.162.71 port 35984 ssh2
Nov  3 02:15:17 web01 sshd[1936]: Invalid user admin from 193.32.162.71 port 53757
Nov  3 02:15:18 web01 sshd[1937]: Failed password for invalid user admin from 193.32.162.71 port 53757 ssh2
Nov  3 02:15:22 web01 sshd[1938]: Invalid user ubuntu from 193.32.162.71 port 33772
Nov  3 02:15:23 web01 sshd[1939]: Failed password for invalid user ubuntu from 193.32.162.71 port 33772 ssh2
Nov  3 02:15:25 web01 sshd[1940]: Failed password for backup from 193.32.162.71 port 62749 ssh2
Nov  3 02:15:31 web01 sshd[1941]: Invalid user test from 193.32.162.71 port 35934
Nov  3 02:15:32 web01 sshd[1942]: Failed password for invalid user test from 193.32.162.71 port 35934 ssh2
Nov  3 02:15:34 web01 sshd[1943]: Invalid user ubuntu from 193.32.162.71 port 64685
Nov  3 02:15:35 web01 sshd[1944]: Failed password for invalid user ubuntu from 193.32.162.71 port 64685 ssh2
Nov  3 02:15:38 web01 sshd[1945]: Invalid user ubuntu from 193.32.162.71 port 63670
Nov  3 02:15:39 web01 sshd[1946]: Failed password for invalid user ubuntu from 193.32.162.71 port 63670 ssh2
Nov  3 02:15:42 web01 sshd[1947]: Invalid user oracle from 193.32.162.71 port 48207
Nov  3 02:15:43 web01 sshd[1948]: Failed password for invalid user oracle from 193.32.162.71 port 48207 ssh2
Nov  3 02:15:47 web01 sshd[1949]: Invalid user postgres from 193.32.162.71 port 36778
Nov  3 02:15:48 web01 sshd[1950]: Failed password for invalid user postgres from 193.32.162.71 port 36778 ssh2
Nov  3 02:15:53 web01 sshd[1951]: Invalid user admin from 193.32.162.71 port 33453
Nov  3 02:15:54 web01 sshd[1952]: Failed password for invalid user admin from 193.32.162.71 port 33453 ssh2
Nov  3 02:15:56 web01 sshd[1953]: Failed password for root from 193.32.162.71 port 34552 ssh2
Nov  3 02:15:58 web01 sshd[1954]: Invalid user ubuntu from 193.32.162.71 port 30428
Nov  3 02:15:59 web01 sshd[1955]: Failed password for invalid user ubuntu from 193.32.162.71 port 30428 ssh2
Nov  3 02:16:03 web01 sshd[1956]: Invalid user ubuntu from 193.32.162.71 port 32063
Nov  3 02:16:04 web01 sshd[1957]: Failed password for invalid user ubuntu from 193.32.162.71 port 32063 ssh2
Nov  3 02:16:07 web01 sshd[1958]: Failed password for root from 193.32.162.71 port 43274 ssh2
Nov  3 02:16:09 web01 sshd[1959]: Invalid user ubuntu from 193.32.162.71 port 41797
Nov  3 02:16:10 web01 sshd[1960]: Failed password for invalid user ubuntu from 193.32.162.71 port 41797 ssh2
Nov  3 02:16:13 web01 sshd[1961]: Failed password for backup from 193.32.162.71 port 49147 ssh2
Nov  3 02:16:17 web01 sshd[1962]: Failed password for backup from 193.32.162.71 port 59892 ssh2
Nov  3 02:16:20 web01 sshd[1963]: Failed password for backup from 193.32.162.71 port 45443 ssh2
Nov  3 02:16:22 web01 sshd[1964]: Failed password for backup from 193.32.162.71 port 56150 ssh2
Nov  3 02:16:27 web01 sshd[1965]: Accepted password for backup from 193.32.162.71 port 58328 ssh2
Nov  3 02:16:28 web01 sshd[1966]: pam_unix(sshd:session): session opened for user backup(uid=1001) by (uid=0)
Nov  3 02:16:48 web01 CRON[1838]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:23:17 web01 CRON[1839]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:30:02 web01 CRON[1840]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:31:01 web01 sshd[1847]: Accepted publickey for adaeze from 10.0.2.15 port 62230 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 02:31:02 web01 sshd[1848]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
Nov  3 02:37:03 web01 CRON[1841]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:44:37 web01 CRON[1842]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:49:53 web01 sshd[1849]: Accepted publickey for adaeze from 10.0.2.15 port 30060 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 02:49:54 web01 sshd[1850]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
```

**1a.** Source IP address of the brute-force attack?  
**1b.** Account the attacker successfully logged in to?  
**1c.** Number of `Failed password` entries from that IP?  
**1d.** (Practice, not scored) Write a one-line command that counts failed logins per source IP.

## PBQ 2. Find insecure services with nmap (3 points)

You scan the in-scope file server to find services that expose credentials or data in cleartext.

```text
analyst@kali:~$ nmap -sV 10.0.5.20
Starting Nmap 7.94 ( https://nmap.org ) at 2026-11-03 09:12 WAT
Nmap scan report for fileserver01 (10.0.5.20)
Host is up (0.0011s latency).
Not shown: 993 closed tcp ports (reset)
PORT     STATE SERVICE      VERSION
21/tcp   open  ftp          vsftpd 3.0.5
22/tcp   open  ssh          OpenSSH 9.6p1 Ubuntu 3ubuntu13.5 (Ubuntu Linux; protocol 2.0)
23/tcp   open  telnet       Linux telnetd
80/tcp   open  http         nginx 1.24.0 (Ubuntu)
139/tcp  open  netbios-ssn  Samba smbd 4.6.2
445/tcp  open  netbios-ssn  Samba smbd 4.6.2
3306/tcp open  mysql        MySQL 8.0.39-0ubuntu0.24.04.2
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 11.62 seconds
```

**2a.** Port offering a cleartext remote shell that should be disabled?  
**2b.** Open port administrators should use for remote shell access instead?  
**2c.** Port transferring files in cleartext that should be replaced with SFTP or FTPS?

## PBQ 3. Verify installer integrity (3 points)

Installers are staged for rollout. The vendors' published SHA-256 values are in `vendor_hashes.txt`.

```text
analyst@ws-it-07:~/downloads$ cat vendor_hashes.txt
5bb2bb81f8889bf66be0f825e9defe45b25a6d52adc38082c8a8f56fee8dff02  agent-installer-v4.2.exe
8316181d9692298ed66e45673a5118844fac09a217eb71cbebdb2332ae49860e  vpn-client-3.1.msi
6666386a26df62fe5a706bcb5f555297dcb406658c174d450131bd1ff1602bbb  backup-tool-1.8.deb
1f407cf97d6c6e961ae68e61d62060b3edeb46b9c5ff364ef441ed442775663d  pdf-reader-2026.2.exe

analyst@ws-it-07:~/downloads$ sha256sum agent-installer-v4.2.exe vpn-client-3.1.msi backup-tool-1.8.deb pdf-reader-2026.2.exe
5bb2bb81f8889bf66be0f825e9defe45b25a6d52adc38082c8a8f56fee8dff02  agent-installer-v4.2.exe
8316181d9692298ed66e45673a5118844fac09a217eb71cbebdb2332ae49860e  vpn-client-3.1.msi
6666388652ab9ee82931f163e11eb66ca7cb7a8b7a6bfc6bbb093ae6a1602bbb  backup-tool-1.8.deb
1f407cf97d6c6e961ae68e61d62060b3edeb46b9c5ff364ef441ed442775663d  pdf-reader-2026.2.exe
```

**3a.** Which file failed the integrity check?  
**3b.** What should you do with that file?

- A. Deploy it, because the other three files passed
- B. Quarantine it, report it, and obtain a fresh copy from the vendor's official source, then verify again
- C. Rename the file and run sha256sum again
- D. Recalculate the vendor's hash and update vendor_hashes.txt to match

**3c.** Which security goal does comparing hashes confirm?

- A. Confidentiality
- B. Integrity
- C. Availability
- D. Non-repudiation

## PBQ 4. Harden file permissions and SSH (4 points)

Hardening review of `web01`. Record the fixes you would make.

```text
analyst@web01:~$ ls -l /etc
total 24
-rw-r--r-- 1 root     root            93 Nov  3 09:14 group
-rw-r--r-- 1 root     root             6 Nov  3 09:14 hostname
-rw-r--r-- 1 root     root           342 Nov  3 09:14 passwd
-rw-r--rw- 1 root     shadow         455 Nov  3 09:14 shadow
drwxr-xr-x 2 root     root          4096 Nov  3 09:14 ssh
-r--r----- 1 root     root            66 Nov  3 09:14 sudoers

analyst@web01:~$ ls -la /home/deploy/.ssh
total 20
drwxr-xr-x 2 deploy   deploy        4096 Nov  3 09:14 .
drwxr-xr-x 2 deploy   deploy        4096 Nov  3 09:14 ..
-rw------- 1 deploy   deploy         566 Nov  3 09:14 authorized_keys
-rw-r--r-- 1 deploy   deploy        2602 Nov  3 09:14 id_rsa
-rw-r--r-- 1 deploy   deploy         566 Nov  3 09:14 id_rsa.pub

analyst@web01:~$ cat /etc/ssh/sshd_config
# This is the sshd server system-wide configuration file.
# See sshd_config(5) for more information.
Include /etc/ssh/sshd_config.d/*.conf

Port 22
#AddressFamily any
#ListenAddress 0.0.0.0

PermitRootLogin yes
MaxAuthTries 6
PubkeyAuthentication yes
PasswordAuthentication yes
PermitEmptyPasswords no
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding yes
PrintMotd no
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server
```

**4a.** Which file in `/etc` has dangerously permissive permissions?  
**4b.** Octal mode for that file (owner read/write, group read, others nothing)?  
**4c.** Octal mode for the private key `id_rsa`?  
**4d.** Which `sshd_config` directive should be set to `no` to block direct root logins?

## PBQ 5. Configure the perimeter firewall (4 points)

Rules are processed top to bottom; first match wins. Fill in **Port** and **Action** for each rule.

1. Anyone on the internet can reach the website on web01 over HTTPS only.
2. The admin LAN can manage web01 over SSH.
3. Only web01 can reach the database on db01.
4. Everything else is blocked.

```text
  Internet ──┐
             ▼
        [ Firewall ]──► DMZ        web01  10.1.1.10  (HTTPS website)
             │
             ├────────► DB zone    db01   10.1.2.20  (MySQL)
             │
  Admin LAN 192.168.10.0/24
```

Port choices: Any, 22, 23, 80, 443, 3306, 3389. Action choices: ALLOW, DENY.

| # | Source | Destination | Port | Protocol | Action |
|---|---|---|---|---|---|
| 1 | Any | 10.1.1.10 | ______ | TCP | ______ |
| 2 | 192.168.10.0/24 | 10.1.1.10 | ______ | TCP | ______ |
| 3 | 10.1.1.10 | 10.1.2.20 | ______ | TCP | ______ |
| 4 | Any | Any | ______ | TCP | ______ |

---

# Part 2: Multiple-choice questions

**6.** The security team inserts a fake customer record with a unique email address into the production database. Any email sent to that address would prove the data was stolen. What is this?

- A. DNS sinkhole
- B. Honeynet
- C. Honeytoken
- D. Honeypot

**7.** The SOC confirms ransomware on three workstations and it is spreading. What should the analyst do FIRST?

- A. Isolate the affected workstations from the network
- B. Reimage the workstations immediately
- C. Notify all customers
- D. Restore files from backup

**8.** A server is worth $200,000. A flood would damage 25% of it, and floods are expected once every two years. What is the annualized loss expectancy?

- A. $25,000
- B. $12,500
- C. $50,000
- D. $100,000

**9.** Attackers compromise an industry association's website that engineers at a target company visit every week, and plant an exploit kit on it. What is this?

- A. Drive-by download from malvertising
- B. Spear phishing
- C. Watering hole attack
- D. Typosquatting

**10.** What is the BEST way to measure whether security awareness training is working?

- A. Count how many employees finished the course
- B. Track phishing simulation click and report rates over time
- C. Ask employees if they enjoyed the course
- D. Measure training video length

**11.** An accounts payable clerk receives an email from ceo@contoso-group.co (the real domain is contosogroup.com) asking for an urgent wire to a new supplier before end of day. What attack is this?

- A. Business email compromise
- B. Watering hole
- C. Pharming
- D. Smishing

**12.** A DevOps team defines its servers, networks and firewall rules in version-controlled templates so every environment is built identically. What is this?

- A. Serverless computing
- B. Infrastructure as code
- C. Microservices
- D. Containerization

**13.** A government ministry's website is defaced with a political slogan protesting a new law. Which threat actor is most likely?

- A. Hacktivist
- B. Nation-state
- C. Competitor
- D. Organized crime

**14.** Which document lists identified risks with their likelihood, impact, owner and planned response?

- A. Incident response plan
- B. Asset inventory
- C. Business impact analysis
- D. Risk register

**15.** A popular web application must stay available if one of its three web servers fails. Which device distributes requests and stops sending traffic to a failed server?

- A. Forward proxy
- B. IDS sensor
- C. Web application firewall
- D. Load balancer

**16.** A customer asks an online retailer to permanently delete all personal data it holds about her. Which privacy right is she exercising?

- A. Data retention
- B. Right to be forgotten
- C. Data portability
- D. Data minimization

**17.** A storage array fails on average once every 18,000 hours. Which metric is this?

- A. MTBF
- B. RTO
- C. RPO
- D. MTTR

**18.** Administrators must reach servers in a restricted zone only through a single hardened, monitored host. What is that host called?

- A. Load balancer
- B. Jump server
- C. Proxy server
- D. Bastion VLAN

**19.** A company wants to be able to inspect a cloud vendor's security controls at any time. What should the contract include?

- A. Right-to-audit clause
- B. Indemnification clause
- C. Force majeure clause
- D. Non-compete clause

**20.** **(Choose TWO)** A user's account appears to have signed in from another country while she was at her desk. Which TWO data sources BEST confirm this?

- A. VPN concentrator logs
- B. Identity provider sign-in logs
- C. Patch management reports
- D. Printer logs
- E. Badge system battery reports

**21.** A file server shows thousands of documents renamed with a .locked extension, very high disk activity, and a README_RESTORE.txt in every folder. What type of malware is this?

- A. Logic bomb
- B. Spyware
- C. Ransomware
- D. Rootkit

**22.** Legal counsel tells IT to stop the automatic deletion of a former manager's mailbox because of a pending lawsuit. What is this?

- A. Data retention policy
- B. E-discovery
- C. Chain of custody
- D. Legal hold

**23.** A regulator requires that records about a country's citizens be stored on servers physically located within that country. Which concept is this?

- A. Data classification
- B. Data masking
- C. Geofencing
- D. Data sovereignty

**24.** A hosting contract guarantees 99.9% monthly uptime and service credits if it is missed. What type of agreement contains this?

- A. MOU
- B. NDA
- C. BPA
- D. SLA

**25.** An analyst wants to open a suspicious attachment to see what it does without risking production systems. What should she use?

- A. Proxy
- B. Sandbox
- C. Jump server
- D. Honeypot

**26.** **(Choose TWO)** Which TWO are direct consequences an organization can face for failing to meet regulatory compliance requirements?

- A. Lower single loss expectancy
- B. Higher MTBF
- C. Faster patch cycles
- D. Fines
- E. Loss of licence to operate

**27.** A trusted vendor's software update server is compromised and pushes a signed update containing a backdoor to thousands of customers. What attack is this?

- A. Zero-day exploit
- B. Insider threat
- C. Supply chain attack
- D. Shadow IT

**28.** Call-centre agents see customer card numbers displayed as ************4417. Which technique is used?

- A. Encryption
- B. Hashing
- C. Tokenization
- D. Data masking

**29.** The company needs to detect suspicious process behaviour on laptops, isolate a laptop remotely, and roll back malicious changes. What fits BEST?

- A. Host-based firewall
- B. File integrity monitoring
- C. EDR
- D. Antivirus with signature updates

**30.** A sales team frequently travels with laptops containing customer data. Which control BEST protects the data if a laptop is stolen?

- A. Host-based firewall
- B. Cable locks
- C. Full-disk encryption
- D. Screen privacy filters

**31.** Several hosts on a LAN show the default gateway's IP address mapped to the MAC address of an employee's laptop. What attack is most likely?

- A. DNS spoofing
- B. ARP poisoning
- C. VLAN hopping
- D. MAC flooding

**32.** Forty new IP cameras were just installed. What is the most important hardening step?

- A. Turn on UPnP for easier access
- B. Disable firmware updates
- C. Enable the built-in Wi-Fi
- D. Change the default administrator credentials

**33.** A control would cost $90,000 a year to protect against a risk with an ALE of $4,000. Management decides to do nothing. Which risk response is this?

- A. Transference
- B. Acceptance
- C. Mitigation
- D. Avoidance

**34.** Following the order of volatility, which should a forensic analyst collect FIRST from a running server?

- A. Archived backups
- B. RAM contents
- C. Logs on the remote syslog server
- D. Hard drive image

**35.** Administrators receive elevated rights only after an approved request, and the rights expire automatically after two hours. What is this?

- A. Role-based access control
- B. Federation
- C. Just-in-time access through PAM
- D. Mandatory access control

**36.** While logged in to her bank, a user opens a forum post with a hidden image tag that silently submits a funds-transfer request to the bank using her session. What is this?

- A. Clickjacking
- B. Cross-site scripting
- C. Session replay
- D. Cross-site request forgery

**37.** After a retailer's breach, attackers try the leaked email and password pairs against a bank's login page. What attack is this?

- A. Credential stuffing
- B. Password spraying
- C. Pass the hash
- D. Birthday attack

**38.** A subscription app needs to bill customers monthly without storing their actual card numbers. Which technique fits BEST?

- A. Hashing
- B. Steganography
- C. Data masking
- D. Tokenization

**39.** Which technique increases the computational cost of every password guess against stored hashes, for example by running the hash function thousands of times?

- A. Obfuscation
- B. Key stretching
- C. Salting
- D. Tokenization

**40.** A directory server must accept LDAP queries over TLS. Which port is used?

- A. 389
- B. 636
- C. 3268
- D. 443

**41.** Before a board meeting, an analyst compares the company's current controls against the NIST Cybersecurity Framework to list what is missing. What is this activity?

- A. Penetration test
- B. Gap analysis
- C. Tabletop exercise
- D. Risk transference

**42.** With a SaaS email platform, which security responsibility stays with the customer?

- A. Physical security of the data centre
- B. Managing user accounts and access
- C. Patching the mail servers
- D. Replacing failed network hardware

**43.** Which activity identifies an organization's critical business functions and the impact of losing them over time?

- A. Vulnerability assessment
- B. Tabletop exercise
- C. Business impact analysis
- D. Risk register review

**44.** Which of the following is an asymmetric algorithm?

- A. ECC
- B. 3DES
- C. ChaCha20
- D. AES

**45.** What is the MOST secure way to protect a SCADA control network from internet-based attacks?

- A. Change its subnet regularly
- B. Air-gap it from other networks
- C. Put it behind a NAT router
- D. Use WPA3 on the plant Wi-Fi

**46.** A warehouse posts signs reading 'Premises protected by 24-hour CCTV.' What control type are the signs themselves?

- A. Deterrent
- B. Compensating
- C. Preventive
- D. Detective

**47.** Which control can block an outbound email because the attachment contains 50 payment card numbers?

- A. WAF
- B. Proxy cache
- C. IDS
- D. DLP

**48.** A medical imaging device runs an unsupported operating system that the vendor will not patch. What is the BEST mitigation?

- A. Disable antivirus to improve performance
- B. Expose it through a public IP so the vendor can monitor it
- C. Accept the risk without further action
- D. Place the device on an isolated network segment with tightly restricted access

**49.** A company runs virtual machines on an IaaS cloud platform. Who is responsible for patching the guest operating system?

- A. The hypervisor vendor
- B. The cloud provider
- C. The customer
- D. Shared equally

**50.** **(Choose TWO)** Which TWO settings provide the strongest security for a corporate wireless network?

- A. Hiding the SSID
- B. 802.1X authentication against a RADIUS server
- C. MAC address filtering
- D. WEP with a 128-bit key
- E. WPA3-Enterprise

**51.** Authentication logs show the password 'Summer2026!' tried once against 400 different accounts over an hour, and no accounts were locked out. What attack is this?

- A. Rainbow table
- B. Password spraying
- C. Brute force
- D. Credential stuffing

**52.** A firewall protecting a payment database loses its inspection engine. Policy says no traffic may pass uninspected. How should the firewall be configured?

- A. Round-robin
- B. Fail-closed
- C. Fail-open
- D. Active/passive

**53.** Based on a new threat report, an analyst proactively searches the environment for signs of a technique that has not triggered any alerts. What is this?

- A. Vulnerability scanning
- B. Threat hunting
- C. Incident response
- D. Penetration testing

**54.** A photo-printing app asks for permission to read a user's cloud photo library without ever receiving the user's password. Which protocol enables this?

- A. OAuth
- B. SAML
- C. LDAP
- D. NTLM

**55.** A finance director wants recipients to be able to prove that a payment-approval email came from her and that she cannot later deny sending it. What should she use?

- A. Encrypt the email with AES-256
- B. Send the email over TLS
- C. Digitally sign the email with her private key
- D. Hash the email with SHA-256 and attach the hash

**56.** New employees must sign a document stating they will not install personal software or browse gambling sites on company devices. What is this document?

- A. Service level agreement
- B. Acceptable use policy
- C. Non-disclosure agreement
- D. Memorandum of understanding

**57.** Which document records every person who handled a seized laptop, when, and why, so the evidence is admissible in court?

- A. Legal hold
- B. Chain of custody
- C. Rules of engagement
- D. Incident report

**58.** Why would an analyst run a credentialed vulnerability scan instead of a non-credentialed one?

- A. It does not need any network access
- B. It is faster
- C. It can read installed software versions and configurations, giving fewer false positives
- D. It shows what an outside attacker sees

**59.** Which DNS record tells receiving mail servers what to do with messages that fail SPF and DKIM checks, and where to send reports?

- A. MX
- B. CNAME
- C. PTR
- D. DMARC

**60.** Management says the business can tolerate losing at most 15 minutes of transaction data. Which metric does this define?

- A. RTO
- B. RPO
- C. MTTR
- D. MTBF

**61.** A vulnerability scanner reports an Apache vulnerability on a server that runs only Microsoft IIS. What is this finding?

- A. False positive
- B. False negative
- C. True positive
- D. True negative

**62.** A company buys a cyber insurance policy to cover the cost of a data breach. Which risk response is this?

- A. Transfer
- B. Mitigate
- C. Avoid
- D. Accept

**63.** A developer added code that deletes the payroll database if his employee ID is ever removed from the HR system. What is this?

- A. Trojan
- B. Worm
- C. Logic bomb
- D. Backdoor

**64.** An attacker sends a 5,000-character input to a C program that expects 64 characters, overwriting the return address on the stack so execution jumps to injected code. What vulnerability is this?

- A. Memory leak
- B. Integer overflow
- C. Race condition
- D. Buffer overflow

**65.** Which document gives step-by-step instructions for how the help desk resets a user's password?

- A. Standard
- B. Policy
- C. Procedure
- D. Guideline

**66.** An employee is terminated this morning. What should IT do FIRST with the employee's accounts?

- A. Leave them active until the end of the month
- B. Disable them
- C. Delete them immediately
- D. Reset the passwords and email the new ones to the manager

**67.** Which vulnerability should be remediated FIRST?

- A. CVSS 7.5 on an internal print server
- B. CVSS 9.8 on an isolated lab machine
- C. CVSS 5.3 on an internet-facing web server
- D. CVSS 9.8 on an internet-facing web server

**68.** Which tool aggregates logs from firewalls, servers and endpoints and correlates them to raise alerts?

- A. SIEM
- B. NAC
- C. SOAR
- D. DLP

**69.** Penetration testers are given network diagrams, source code and administrator documentation before the test. What type of test is this?

- A. Known environment
- B. Partially known environment
- C. Passive reconnaissance
- D. Unknown environment

**70.** Users report a site at paypa1-secure.com that looks identical to a real payment provider. The attacker registered it hoping users mistype or misread the name. What is this?

- A. Typosquatting
- B. Domain hijacking
- C. DNS poisoning
- D. Session hijacking

**71.** Concrete bollards are installed in front of a data centre's glass entrance to stop vehicles from ramming it. Which control category is this?

- A. Technical
- B. Managerial
- C. Physical
- D. Operational

**72.** A bank must be operating from an alternate site within one hour of a disaster, with current data. Which recovery site fits?

- A. Hot site
- B. Warm site
- C. Mobile site
- D. Cold site

**73.** A company uses an external payroll provider that processes employee data only on the company's instructions. Under data privacy law, what is the payroll provider?

- A. Data processor
- B. Data subject
- C. Data custodian
- D. Data controller

**74.** The board states it is willing to accept moderate cyber risk in exchange for faster product launches. What does this statement describe?

- A. Inherent risk
- B. Residual risk
- C. Risk threshold
- D. Risk appetite

**75.** A stealthy intrusion at a defence contractor persisted for 14 months, used custom malware, and was attributed to a foreign government. Which threat actor is this?

- A. Nation-state
- B. Organized crime
- C. Hacktivist
- D. Insider

**76.** A customer wants evidence that a SaaS provider's controls operated effectively over the past twelve months. Which report should they request?

- A. SOC 2 Type II
- B. An internal audit memo
- C. SOC 2 Type I
- D. SOC 1 Type I

**77.** A user types a username, enters a password, then approves a push notification on their phone. Which part of AAA do the password and push approval satisfy?

- A. Identification
- B. Accounting
- C. Authentication
- D. Authorization

**78.** **(Choose TWO)** Which TWO controls most directly reduce the success of phishing emails against staff?

- A. Security awareness training with phishing simulations
- B. Disabling ICMP at the perimeter
- C. Full-disk encryption on laptops
- D. SPF, DKIM and DMARC on the email domain
- E. Increasing minimum password length to 16

**79.** After isolating the infected hosts, the team removes the malware and the scheduled tasks it created for persistence. Which incident response phase is this?

- A. Recovery
- B. Containment
- C. Lessons learned
- D. Eradication

**80.** Before approving a database patch, the change advisory board requires a documented way to return the system to its previous state if the patch fails. What is this?

- A. Maintenance window
- B. Standard operating procedure
- C. Impact analysis
- D. Backout plan

**81.** In a zero trust architecture, which component evaluates policy and decides whether a subject may access a resource?

- A. Implicit trust zone
- B. Data plane
- C. Policy enforcement point
- D. Policy engine

**82.** The marketing team starts storing customer lists in a free file-sharing service that IT never approved. Which threat does this represent?

- A. Unskilled attacker
- B. Hacktivist
- C. Shadow IT
- D. Nation-state actor

**83.** Which version of SNMP adds authentication and encryption?

- A. SNMPv1
- B. All versions
- C. SNMPv3
- D. SNMPv2c

**84.** Which combination is multifactor authentication?

- A. Smart card and hardware token
- B. Password and fingerprint
- C. Password and PIN
- D. Security question and password

**85.** A program checks that a user may write to a file, and in the moment before it opens the file, an attacker replaces it with a link to /etc/passwd. What is this vulnerability called?

- A. Directory traversal
- B. Memory injection
- C. Time-of-check to time-of-use (TOCTOU)
- D. Privilege escalation via SUID

**86.** A web server log shows the login field received `admin' OR 1=1 --`. Which control BEST prevents this attack?

- A. Limit the username field to 20 characters
- B. Encrypt the database at rest
- C. Run the WAF in detection-only mode
- D. Use parameterized queries (prepared statements)

**87.** When a phishing report arrives, the team wants a playbook to automatically pull the email headers, check URLs against threat intel, and block the sender. Which tool does this?

- A. EDR
- B. IPS
- C. SIEM
- D. SOAR

**88.** An organization wants employees to sign in once to its identity provider and access several web apps using XML-based assertions. Which standard is this?

- A. SAML
- B. RADIUS
- C. TACACS+
- D. Kerberos

**89.** An attacker posts a product review containing a script. Every visitor who later opens the review page runs the script in their browser. What is this?

- A. Stored XSS
- B. Reflected XSS
- C. CSRF
- D. SSRF

**90.** A company wants secure web gateway, CASB and zero trust network access delivered from the cloud to staff wherever they work. Which architecture is this?

- A. SD-WAN only
- B. Site-to-site VPN
- C. Screened subnet
- D. SASE

---

# Part 3: Answer sheet

Candidate name: ____________________   Date: ____________   Start time: ________   End time: ________

### PBQ answers

| PBQ | Part a | Part b | Part c | Part d |
|---|---|---|---|---|
| 1 | | | | n/a |
| 2 | | | | n/a |
| 3 | | | | n/a |
| 4 | | | |  |
| 5 | Rule 1: ___ / ___ | Rule 2: ___ / ___ | Rule 3: ___ / ___ | Rule 4: ___ / ___ |

### Multiple-choice answers

Put a mark in the Flag column for questions you want to revisit.

| Q | Ans | Flag | Q | Ans | Flag | Q | Ans | Flag |
|---|---|---|---|---|---|---|---|---|
| 6 | | | 35 | | | 64 | | |
| 7 | | | 36 | | | 65 | | |
| 8 | | | 37 | | | 66 | | |
| 9 | | | 38 | | | 67 | | |
| 10 | | | 39 | | | 68 | | |
| 11 | | | 40 | | | 69 | | |
| 12 | | | 41 | | | 70 | | |
| 13 | | | 42 | | | 71 | | |
| 14 | | | 43 | | | 72 | | |
| 15 | | | 44 | | | 73 | | |
| 16 | | | 45 | | | 74 | | |
| 17 | | | 46 | | | 75 | | |
| 18 | | | 47 | | | 76 | | |
| 19 | | | 48 | | | 77 | | |
| 20 | | | 49 | | | 78 | | |
| 21 | | | 50 | | | 79 | | |
| 22 | | | 51 | | | 80 | | |
| 23 | | | 52 | | | 81 | | |
| 24 | | | 53 | | | 82 | | |
| 25 | | | 54 | | | 83 | | |
| 26 | | | 55 | | | 84 | | |
| 27 | | | 56 | | | 85 | | |
| 28 | | | 57 | | | 86 | | |
| 29 | | | 58 | | | 87 | | |
| 30 | | | 59 | | | 88 | | |
| 31 | | | 60 | | | 89 | | |
| 32 | | | 61 | | | 90 | | |
| 33 | | | 62 | | |  | | |
| 34 | | | 63 | | |  | | |

---

# Part 4: Retake PBQs (version B)

Use these for a second sitting a week later. Same skills, new values. Allow 25 minutes. Answers are in Part 6.

## PBQ B1. Investigate an SSH brute-force alert (3 points)

A SIEM alert for repeated SSH login failures fired on `web01`. Below is `/var/log/auth.log`.

```text
analyst@web01:~$ cat /var/log/auth.log
Nov  3 01:48:30 web01 CRON[1834]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 01:53:57 web01 sshd[1843]: Accepted publickey for adaeze from 10.0.2.15 port 37554 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 01:53:58 web01 sshd[1844]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
Nov  3 01:55:54 web01 CRON[1835]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 01:58:00 web01 sshd[1851]: Invalid user pi from 45.155.205.233 port 51964
Nov  3 01:58:01 web01 sshd[1852]: Failed password for invalid user pi from 45.155.205.233 port 51964 ssh2
Nov  3 01:58:03 web01 sshd[1853]: Invalid user test from 45.155.205.233 port 54989
Nov  3 01:58:04 web01 sshd[1854]: Failed password for invalid user test from 45.155.205.233 port 54989 ssh2
Nov  3 01:58:10 web01 sshd[1855]: Invalid user admin from 45.155.205.233 port 44037
Nov  3 01:58:11 web01 sshd[1856]: Failed password for invalid user admin from 45.155.205.233 port 44037 ssh2
Nov  3 01:58:15 web01 sshd[1857]: Invalid user ftpuser from 45.155.205.233 port 54941
Nov  3 01:58:16 web01 sshd[1858]: Failed password for invalid user ftpuser from 45.155.205.233 port 54941 ssh2
Nov  3 01:58:20 web01 sshd[1859]: Invalid user user from 45.155.205.233 port 35704
Nov  3 01:58:21 web01 sshd[1860]: Failed password for invalid user user from 45.155.205.233 port 35704 ssh2
Nov  3 01:58:27 web01 sshd[1861]: Invalid user pi from 45.155.205.233 port 54619
Nov  3 01:58:28 web01 sshd[1862]: Failed password for invalid user pi from 45.155.205.233 port 54619 ssh2
Nov  3 01:58:34 web01 sshd[1863]: Invalid user ftpuser from 45.155.205.233 port 31948
Nov  3 01:58:35 web01 sshd[1864]: Failed password for invalid user ftpuser from 45.155.205.233 port 31948 ssh2
Nov  3 01:58:38 web01 sshd[1865]: Invalid user guest from 45.155.205.233 port 43815
Nov  3 01:58:39 web01 sshd[1866]: Failed password for invalid user guest from 45.155.205.233 port 43815 ssh2
Nov  3 01:58:46 web01 sshd[1867]: Invalid user ftpuser from 45.155.205.233 port 32277
Nov  3 01:58:47 web01 sshd[1868]: Failed password for invalid user ftpuser from 45.155.205.233 port 32277 ssh2
Nov  3 01:58:49 web01 sshd[1869]: Invalid user admin from 45.155.205.233 port 50114
Nov  3 01:58:50 web01 sshd[1870]: Failed password for invalid user admin from 45.155.205.233 port 50114 ssh2
Nov  3 01:58:55 web01 sshd[1871]: Invalid user test from 45.155.205.233 port 41579
Nov  3 01:58:56 web01 sshd[1872]: Failed password for invalid user test from 45.155.205.233 port 41579 ssh2
Nov  3 01:59:00 web01 sshd[1873]: Invalid user test from 45.155.205.233 port 46227
Nov  3 01:59:01 web01 sshd[1874]: Failed password for invalid user test from 45.155.205.233 port 46227 ssh2
Nov  3 02:02:33 web01 CRON[1836]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:03:51 web01 sshd[1875]: Failed password for chidi from 102.89.34.12 port 60764 ssh2
Nov  3 02:04:03 web01 sshd[1876]: Failed password for chidi from 102.89.34.12 port 61284 ssh2
Nov  3 02:04:16 web01 sshd[1877]: Accepted password for chidi from 102.89.34.12 port 36035 ssh2
Nov  3 02:09:39 web01 CRON[1837]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:13:00 web01 sshd[1878]: Invalid user ubuntu from 91.240.118.29 port 63447
Nov  3 02:13:01 web01 sshd[1879]: Failed password for invalid user ubuntu from 91.240.118.29 port 63447 ssh2
Nov  3 02:13:06 web01 sshd[1880]: Failed password for svc_web from 91.240.118.29 port 45362 ssh2
Nov  3 02:13:11 web01 sshd[1881]: Invalid user ubuntu from 91.240.118.29 port 64108
Nov  3 02:13:12 web01 sshd[1882]: Failed password for invalid user ubuntu from 91.240.118.29 port 64108 ssh2
Nov  3 02:13:13 web01 sshd[1883]: Invalid user ubuntu from 91.240.118.29 port 60064
Nov  3 02:13:14 web01 sshd[1884]: Failed password for invalid user ubuntu from 91.240.118.29 port 60064 ssh2
Nov  3 02:13:16 web01 sshd[1885]: Invalid user oracle from 91.240.118.29 port 32279
Nov  3 02:13:17 web01 sshd[1886]: Failed password for invalid user oracle from 91.240.118.29 port 32279 ssh2
Nov  3 02:13:19 web01 sshd[1887]: Failed password for root from 91.240.118.29 port 45789 ssh2
Nov  3 02:13:25 web01 sshd[1888]: Invalid user admin from 91.240.118.29 port 37815
Nov  3 02:13:26 web01 sshd[1889]: Failed password for invalid user admin from 91.240.118.29 port 37815 ssh2
Nov  3 02:13:29 web01 sshd[1890]: Invalid user ubuntu from 91.240.118.29 port 30670
Nov  3 02:13:30 web01 sshd[1891]: Failed password for invalid user ubuntu from 91.240.118.29 port 30670 ssh2
Nov  3 02:13:34 web01 sshd[1892]: Invalid user oracle from 91.240.118.29 port 48358
Nov  3 02:13:35 web01 sshd[1893]: Failed password for invalid user oracle from 91.240.118.29 port 48358 ssh2
Nov  3 02:13:36 web01 sshd[1894]: Invalid user test from 91.240.118.29 port 48473
Nov  3 02:13:37 web01 sshd[1895]: Failed password for invalid user test from 91.240.118.29 port 48473 ssh2
Nov  3 02:13:38 web01 sshd[1896]: Failed password for svc_web from 91.240.118.29 port 50887 ssh2
Nov  3 02:13:42 web01 sshd[1897]: Invalid user admin from 91.240.118.29 port 48556
Nov  3 02:13:43 web01 sshd[1898]: Failed password for invalid user admin from 91.240.118.29 port 48556 ssh2
Nov  3 02:13:44 web01 sshd[1899]: Invalid user test from 91.240.118.29 port 47119
Nov  3 02:13:45 web01 sshd[1900]: Failed password for invalid user test from 91.240.118.29 port 47119 ssh2
Nov  3 02:13:50 web01 sshd[1901]: Invalid user test from 91.240.118.29 port 47555
Nov  3 02:13:51 web01 sshd[1902]: Failed password for invalid user test from 91.240.118.29 port 47555 ssh2
Nov  3 02:13:56 web01 sshd[1903]: Invalid user test from 91.240.118.29 port 35980
Nov  3 02:13:57 web01 sshd[1904]: Failed password for invalid user test from 91.240.118.29 port 35980 ssh2
Nov  3 02:14:01 web01 sshd[1905]: Invalid user test from 91.240.118.29 port 63149
Nov  3 02:14:02 web01 sshd[1845]: Accepted publickey for adaeze from 10.0.2.15 port 59802 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 02:14:02 web01 sshd[1906]: Failed password for invalid user test from 91.240.118.29 port 63149 ssh2
Nov  3 02:14:03 web01 sshd[1846]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
Nov  3 02:14:03 web01 sshd[1907]: Invalid user test from 91.240.118.29 port 45579
Nov  3 02:14:04 web01 sshd[1908]: Failed password for invalid user test from 91.240.118.29 port 45579 ssh2
Nov  3 02:14:08 web01 sshd[1909]: Invalid user ubuntu from 91.240.118.29 port 36173
Nov  3 02:14:09 web01 sshd[1910]: Failed password for invalid user ubuntu from 91.240.118.29 port 36173 ssh2
Nov  3 02:14:12 web01 sshd[1911]: Invalid user oracle from 91.240.118.29 port 47972
Nov  3 02:14:13 web01 sshd[1912]: Failed password for invalid user oracle from 91.240.118.29 port 47972 ssh2
Nov  3 02:14:16 web01 sshd[1913]: Invalid user test from 91.240.118.29 port 55403
Nov  3 02:14:17 web01 sshd[1914]: Failed password for invalid user test from 91.240.118.29 port 55403 ssh2
Nov  3 02:14:22 web01 sshd[1915]: Invalid user test from 91.240.118.29 port 63693
Nov  3 02:14:23 web01 sshd[1916]: Failed password for invalid user test from 91.240.118.29 port 63693 ssh2
Nov  3 02:14:26 web01 sshd[1917]: Invalid user ubuntu from 91.240.118.29 port 37399
Nov  3 02:14:27 web01 sshd[1918]: Failed password for invalid user ubuntu from 91.240.118.29 port 37399 ssh2
Nov  3 02:14:31 web01 sshd[1919]: Failed password for root from 91.240.118.29 port 60143 ssh2
Nov  3 02:14:34 web01 sshd[1920]: Failed password for svc_web from 91.240.118.29 port 56198 ssh2
Nov  3 02:14:39 web01 sshd[1921]: Failed password for svc_web from 91.240.118.29 port 38206 ssh2
Nov  3 02:14:42 web01 sshd[1922]: Invalid user postgres from 91.240.118.29 port 52038
Nov  3 02:14:43 web01 sshd[1923]: Failed password for invalid user postgres from 91.240.118.29 port 52038 ssh2
Nov  3 02:14:44 web01 sshd[1924]: Invalid user ubuntu from 91.240.118.29 port 62167
Nov  3 02:14:45 web01 sshd[1925]: Failed password for invalid user ubuntu from 91.240.118.29 port 62167 ssh2
Nov  3 02:14:50 web01 sshd[1926]: Invalid user postgres from 91.240.118.29 port 33705
Nov  3 02:14:51 web01 sshd[1927]: Failed password for invalid user postgres from 91.240.118.29 port 33705 ssh2
Nov  3 02:14:55 web01 sshd[1928]: Invalid user ubuntu from 91.240.118.29 port 37603
Nov  3 02:14:56 web01 sshd[1929]: Failed password for invalid user ubuntu from 91.240.118.29 port 37603 ssh2
Nov  3 02:14:57 web01 sshd[1930]: Failed password for svc_web from 91.240.118.29 port 34310 ssh2
Nov  3 02:15:01 web01 sshd[1931]: Invalid user ubuntu from 91.240.118.29 port 53889
Nov  3 02:15:02 web01 sshd[1932]: Failed password for invalid user ubuntu from 91.240.118.29 port 53889 ssh2
Nov  3 02:15:07 web01 sshd[1933]: Failed password for root from 91.240.118.29 port 64993 ssh2
Nov  3 02:15:11 web01 sshd[1934]: Invalid user admin from 91.240.118.29 port 33144
Nov  3 02:15:12 web01 sshd[1935]: Failed password for invalid user admin from 91.240.118.29 port 33144 ssh2
Nov  3 02:15:13 web01 sshd[1936]: Failed password for root from 91.240.118.29 port 60087 ssh2
Nov  3 02:15:15 web01 sshd[1937]: Invalid user test from 91.240.118.29 port 62010
Nov  3 02:15:16 web01 sshd[1938]: Failed password for invalid user test from 91.240.118.29 port 62010 ssh2
Nov  3 02:15:18 web01 sshd[1939]: Failed password for root from 91.240.118.29 port 32735 ssh2
Nov  3 02:15:21 web01 sshd[1940]: Failed password for svc_web from 91.240.118.29 port 58188 ssh2
Nov  3 02:15:26 web01 sshd[1941]: Invalid user test from 91.240.118.29 port 55820
Nov  3 02:15:27 web01 sshd[1942]: Failed password for invalid user test from 91.240.118.29 port 55820 ssh2
Nov  3 02:15:31 web01 sshd[1943]: Failed password for root from 91.240.118.29 port 39173 ssh2
Nov  3 02:15:36 web01 sshd[1944]: Invalid user admin from 91.240.118.29 port 52245
Nov  3 02:15:37 web01 sshd[1945]: Failed password for invalid user admin from 91.240.118.29 port 52245 ssh2
Nov  3 02:15:42 web01 sshd[1946]: Invalid user postgres from 91.240.118.29 port 44145
Nov  3 02:15:43 web01 sshd[1947]: Failed password for invalid user postgres from 91.240.118.29 port 44145 ssh2
Nov  3 02:15:48 web01 sshd[1948]: Failed password for svc_web from 91.240.118.29 port 59867 ssh2
Nov  3 02:15:50 web01 sshd[1949]: Invalid user test from 91.240.118.29 port 30478
Nov  3 02:15:51 web01 sshd[1950]: Failed password for invalid user test from 91.240.118.29 port 30478 ssh2
Nov  3 02:15:52 web01 sshd[1951]: Invalid user postgres from 91.240.118.29 port 47798
Nov  3 02:15:53 web01 sshd[1952]: Failed password for invalid user postgres from 91.240.118.29 port 47798 ssh2
Nov  3 02:15:56 web01 sshd[1953]: Invalid user test from 91.240.118.29 port 63831
Nov  3 02:15:57 web01 sshd[1954]: Failed password for invalid user test from 91.240.118.29 port 63831 ssh2
Nov  3 02:16:00 web01 sshd[1955]: Failed password for svc_web from 91.240.118.29 port 56944 ssh2
Nov  3 02:16:03 web01 sshd[1956]: Failed password for svc_web from 91.240.118.29 port 47701 ssh2
Nov  3 02:16:05 web01 CRON[1838]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:16:08 web01 sshd[1957]: Invalid user ubuntu from 91.240.118.29 port 30281
Nov  3 02:16:09 web01 sshd[1958]: Failed password for invalid user ubuntu from 91.240.118.29 port 30281 ssh2
Nov  3 02:16:14 web01 sshd[1959]: Failed password for svc_web from 91.240.118.29 port 63609 ssh2
Nov  3 02:16:18 web01 sshd[1960]: Invalid user admin from 91.240.118.29 port 53981
Nov  3 02:16:19 web01 sshd[1961]: Failed password for invalid user admin from 91.240.118.29 port 53981 ssh2
Nov  3 02:16:24 web01 sshd[1962]: Invalid user ubuntu from 91.240.118.29 port 37830
Nov  3 02:16:25 web01 sshd[1963]: Failed password for invalid user ubuntu from 91.240.118.29 port 37830 ssh2
Nov  3 02:16:28 web01 sshd[1964]: Failed password for root from 91.240.118.29 port 37037 ssh2
Nov  3 02:16:33 web01 sshd[1965]: Failed password for svc_web from 91.240.118.29 port 60262 ssh2
Nov  3 02:16:39 web01 sshd[1966]: Failed password for svc_web from 91.240.118.29 port 60815 ssh2
Nov  3 02:16:42 web01 sshd[1967]: Failed password for svc_web from 91.240.118.29 port 47844 ssh2
Nov  3 02:16:45 web01 sshd[1968]: Failed password for svc_web from 91.240.118.29 port 47166 ssh2
Nov  3 02:16:48 web01 sshd[1969]: Accepted password for svc_web from 91.240.118.29 port 33474 ssh2
Nov  3 02:16:49 web01 sshd[1970]: pam_unix(sshd:session): session opened for user svc_web(uid=1001) by (uid=0)
Nov  3 02:23:28 web01 CRON[1839]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:30:44 web01 CRON[1840]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:32:20 web01 sshd[1847]: Accepted publickey for adaeze from 10.0.2.15 port 39253 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 02:32:21 web01 sshd[1848]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
Nov  3 02:37:31 web01 CRON[1841]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:44:00 web01 CRON[1842]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:48:35 web01 sshd[1849]: Accepted publickey for adaeze from 10.0.2.15 port 42786 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 02:48:36 web01 sshd[1850]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
```

**B1a.** Source IP address of the brute-force attack?  
**B1b.** Account the attacker successfully logged in to?  
**B1c.** Number of `Failed password` entries from that IP?  
**B1d.** (Practice, not scored) Write a one-line command that counts failed logins per source IP.

## PBQ B2. Find insecure services with nmap (3 points)

You scan the company mail and directory server. Policy: no credentials may cross the network in cleartext.

```text
analyst@kali:~$ nmap -sV 10.0.7.15
Starting Nmap 7.94 ( https://nmap.org ) at 2026-11-03 10:40 WAT
Nmap scan report for mail01 (10.0.7.15)
Host is up (0.0009s latency).
Not shown: 992 closed tcp ports (reset)
PORT     STATE SERVICE   VERSION
22/tcp   open  ssh       OpenSSH 9.6p1 Ubuntu 3ubuntu13.5 (Ubuntu Linux; protocol 2.0)
25/tcp   open  smtp      Postfix smtpd
110/tcp  open  pop3      Dovecot pop3d
143/tcp  open  imap      Dovecot imapd
389/tcp  open  ldap      OpenLDAP 2.2.X - 2.3.X
443/tcp  open  ssl/http  nginx 1.24.0
636/tcp  open  ssl/ldap  OpenLDAP 2.2.X - 2.3.X
993/tcp  open  ssl/imap  Dovecot imapd
Service Info: Host: mail01; OS: Linux
Nmap done: 1 IP address (1 host up) scanned in 13.08 seconds
```

**B2a.** Staff read mail with POP3 today. Which open port carries it in cleartext, and which port should they use instead?  
**B2b.** Which cleartext mail retrieval port has a secure equivalent already open on this server, and what is that secure port?  
**B2c.** Which port should be closed so directory queries only use LDAPS?

## PBQ B3. Verify installer integrity (3 points)

Installers are staged for rollout. The vendors' published SHA-256 values are in `vendor_hashes.txt`.

```text
analyst@ws-it-07:~/downloads$ cat vendor_hashes.txt
d3487499bf97aa135a8934ed7ca8537190ecea815dffce2378f361862d5c60a4  agent-installer-v4.2.exe
5c21158f9252b05fbe99a81a162b364f5498d30afcaff6e1f229fb7ba7756d5a  vpn-client-3.1.msi
bcc593fc2d87645d35553756b615e641215c0f80b264158f8c76d8d4bb9b4ddc  backup-tool-1.8.deb
9d5e16ff7c20d8e4fd0182ef734ecc14ea1c7e25d24e7c939fe2d19c3f5f6437  pdf-reader-2026.2.exe

analyst@ws-it-07:~/downloads$ sha256sum agent-installer-v4.2.exe vpn-client-3.1.msi backup-tool-1.8.deb pdf-reader-2026.2.exe
d34874d34b56fd815f437ecbd846161f3551087e73122b82195d48b25d5c60a4  agent-installer-v4.2.exe
5c21158f9252b05fbe99a81a162b364f5498d30afcaff6e1f229fb7ba7756d5a  vpn-client-3.1.msi
bcc593fc2d87645d35553756b615e641215c0f80b264158f8c76d8d4bb9b4ddc  backup-tool-1.8.deb
9d5e16ff7c20d8e4fd0182ef734ecc14ea1c7e25d24e7c939fe2d19c3f5f6437  pdf-reader-2026.2.exe
```

**B3a.** Which file failed the integrity check?  
**B3b.** What should you do with that file?

- A. Deploy it, because the other three files passed
- B. Quarantine it, report it, and obtain a fresh copy from the vendor's official source, then verify again
- C. Rename the file and run sha256sum again
- D. Recalculate the vendor's hash and update vendor_hashes.txt to match

**B3c.** Which security goal does comparing hashes confirm?

- A. Confidentiality
- B. Integrity
- C. Availability
- D. Non-repudiation

## PBQ B4. Harden file permissions and SSH (4 points)

Hardening review of `web01`. Record the fixes you would make.

```text
analyst@web01:~$ ls -l /etc
total 24
-rw-r--r-- 1 root     root            93 Nov  3 09:14 group
-rw-r--r-- 1 root     root             6 Nov  3 09:14 hostname
-rw-r--r-- 1 root     root           342 Nov  3 09:14 passwd
-rw-r--rw- 1 root     shadow         455 Nov  3 09:14 shadow
drwxr-xr-x 2 root     root          4096 Nov  3 09:14 ssh
-r--r----- 1 root     root            66 Nov  3 09:14 sudoers

analyst@web01:~$ ls -la /home/deploy/.ssh
total 20
drwxr-xr-x 2 deploy   deploy        4096 Nov  3 09:14 .
drwxr-xr-x 2 deploy   deploy        4096 Nov  3 09:14 ..
-rw------- 1 deploy   deploy         566 Nov  3 09:14 authorized_keys
-rw-r--r-- 1 deploy   deploy        2602 Nov  3 09:14 id_rsa
-rw-r--r-- 1 deploy   deploy         566 Nov  3 09:14 id_rsa.pub

analyst@web01:~$ cat /etc/ssh/sshd_config
# This is the sshd server system-wide configuration file.
# See sshd_config(5) for more information.
Include /etc/ssh/sshd_config.d/*.conf

Port 22
#AddressFamily any
#ListenAddress 0.0.0.0

PermitRootLogin yes
MaxAuthTries 6
PubkeyAuthentication yes
PasswordAuthentication yes
PermitEmptyPasswords no
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding yes
PrintMotd no
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server
```

**B4a.** Which file in `/etc` has dangerously permissive permissions?  
**B4b.** Octal mode for that file (owner read/write, group read, others nothing)?  
**B4c.** Octal mode for the private key `id_rsa`?  
**B4d.** Which `sshd_config` directive should be set to `no` to block direct root logins?

## PBQ B5. Configure the perimeter firewall (4 points)

Rules are processed top to bottom; first match wins. Fill in **Port** and **Action** for each rule.

1. Mail from anywhere can be delivered to mail01 with SMTP.
2. Staff anywhere can read mail on mail01 over encrypted IMAP only.
3. The admin LAN can manage mail01 over SSH.
4. Everything else is blocked.

```text
  Internet ──┐
             ▼
        [ Firewall ]──► DMZ   mail01  10.1.1.25  (SMTP, IMAPS)
             │
  Admin LAN 192.168.10.0/24
```

Port choices: Any, 22, 25, 110, 143, 993, 3389. Action choices: ALLOW, DENY.

| # | Source | Destination | Port | Protocol | Action |
|---|---|---|---|---|---|
| 1 | Any | 10.1.1.25 | ______ | TCP | ______ |
| 2 | Any | 10.1.1.25 | ______ | TCP | ______ |
| 3 | 192.168.10.0/24 | 10.1.1.25 | ______ | TCP | ______ |
| 4 | Any | Any | ______ | TCP | ______ |

---

# Part 5: Hands-on terminal lab

This lab creates real practice files on your own computer so you can type every command yourself, not just read output. Nothing here touches your system files: everything lives in a `secplus-lab` folder in your home directory.

**Where to run it:** Ubuntu or Kali Linux, a Linux VM, or WSL on Windows (`wsl --install` in PowerShell, then open Ubuntu). macOS works for most tasks, but use `stat -f '%Lp %N'` instead of `stat -c` and replace `shuf -n1` with `ls | sort -R | head -n1`.

## Step 1. Build the lab

Copy this whole block into a file called `build-lab.sh`, then run `bash build-lab.sh`.

```bash
#!/usr/bin/env bash
# Security+ practice lab: creates ~/secplus-lab with log, hash and permission exercises
set -e
LAB="$HOME/secplus-lab"
rm -rf "$LAB" && mkdir -p "$LAB"/{log,downloads,etc/ssh,home/deploy/.ssh}
cd "$LAB"

# ---- Lab A: authentication log ----
cat > log/auth.log <<'EOF'
Nov  3 01:48:56 web01 CRON[1834]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 01:54:05 web01 sshd[1843]: Accepted publickey for adaeze from 10.0.2.15 port 48034 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 01:54:06 web01 sshd[1844]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
Nov  3 01:55:09 web01 CRON[1835]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 01:58:00 web01 sshd[1851]: Invalid user test from 45.155.205.233 port 61210
Nov  3 01:58:01 web01 sshd[1852]: Failed password for invalid user test from 45.155.205.233 port 61210 ssh2
Nov  3 01:58:05 web01 sshd[1853]: Invalid user guest from 45.155.205.233 port 38235
Nov  3 01:58:06 web01 sshd[1854]: Failed password for invalid user guest from 45.155.205.233 port 38235 ssh2
Nov  3 01:58:08 web01 sshd[1855]: Invalid user guest from 45.155.205.233 port 31897
Nov  3 01:58:09 web01 sshd[1856]: Failed password for invalid user guest from 45.155.205.233 port 31897 ssh2
Nov  3 01:58:12 web01 sshd[1857]: Invalid user test from 45.155.205.233 port 41342
Nov  3 01:58:13 web01 sshd[1858]: Failed password for invalid user test from 45.155.205.233 port 41342 ssh2
Nov  3 01:58:16 web01 sshd[1859]: Invalid user user from 45.155.205.233 port 51655
Nov  3 01:58:17 web01 sshd[1860]: Failed password for invalid user user from 45.155.205.233 port 51655 ssh2
Nov  3 01:58:20 web01 sshd[1861]: Invalid user user from 45.155.205.233 port 42102
Nov  3 01:58:21 web01 sshd[1862]: Failed password for invalid user user from 45.155.205.233 port 42102 ssh2
Nov  3 01:58:24 web01 sshd[1863]: Invalid user guest from 45.155.205.233 port 56361
Nov  3 01:58:25 web01 sshd[1864]: Failed password for invalid user guest from 45.155.205.233 port 56361 ssh2
Nov  3 01:58:28 web01 sshd[1865]: Invalid user admin from 45.155.205.233 port 50090
Nov  3 01:58:29 web01 sshd[1866]: Failed password for invalid user admin from 45.155.205.233 port 50090 ssh2
Nov  3 01:58:34 web01 sshd[1867]: Invalid user admin from 45.155.205.233 port 33551
Nov  3 01:58:35 web01 sshd[1868]: Failed password for invalid user admin from 45.155.205.233 port 33551 ssh2
Nov  3 01:58:41 web01 sshd[1869]: Invalid user guest from 45.155.205.233 port 35176
Nov  3 01:58:42 web01 sshd[1870]: Failed password for invalid user guest from 45.155.205.233 port 35176 ssh2
Nov  3 01:58:46 web01 sshd[1871]: Invalid user guest from 45.155.205.233 port 59880
Nov  3 01:58:47 web01 sshd[1872]: Failed password for invalid user guest from 45.155.205.233 port 59880 ssh2
Nov  3 01:58:49 web01 sshd[1873]: Invalid user pi from 45.155.205.233 port 43574
Nov  3 01:58:50 web01 sshd[1874]: Failed password for invalid user pi from 45.155.205.233 port 43574 ssh2
Nov  3 02:02:00 web01 CRON[1836]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:03:24 web01 sshd[1875]: Failed password for chidi from 102.89.34.12 port 32070 ssh2
Nov  3 02:03:39 web01 sshd[1876]: Failed password for chidi from 102.89.34.12 port 30076 ssh2
Nov  3 02:03:48 web01 sshd[1877]: Accepted password for chidi from 102.89.34.12 port 50838 ssh2
Nov  3 02:09:41 web01 CRON[1837]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:13:00 web01 sshd[1878]: Invalid user oracle from 185.220.101.47 port 44687
Nov  3 02:13:01 web01 sshd[1879]: Failed password for invalid user oracle from 185.220.101.47 port 44687 ssh2
Nov  3 02:13:02 web01 sshd[1880]: Failed password for root from 185.220.101.47 port 48743 ssh2
Nov  3 02:13:06 web01 sshd[1881]: Failed password for backup from 185.220.101.47 port 56334 ssh2
Nov  3 02:13:09 web01 sshd[1882]: Invalid user test from 185.220.101.47 port 57652
Nov  3 02:13:10 web01 sshd[1883]: Failed password for invalid user test from 185.220.101.47 port 57652 ssh2
Nov  3 02:13:12 web01 sshd[1884]: Failed password for backup from 185.220.101.47 port 37123 ssh2
Nov  3 02:13:18 web01 sshd[1885]: Invalid user admin from 185.220.101.47 port 61080
Nov  3 02:13:19 web01 sshd[1886]: Failed password for invalid user admin from 185.220.101.47 port 61080 ssh2
Nov  3 02:13:20 web01 sshd[1887]: Invalid user admin from 185.220.101.47 port 63855
Nov  3 02:13:21 web01 sshd[1888]: Failed password for invalid user admin from 185.220.101.47 port 63855 ssh2
Nov  3 02:13:23 web01 sshd[1889]: Invalid user oracle from 185.220.101.47 port 40606
Nov  3 02:13:24 web01 sshd[1890]: Failed password for invalid user oracle from 185.220.101.47 port 40606 ssh2
Nov  3 02:13:27 web01 sshd[1891]: Invalid user ubuntu from 185.220.101.47 port 56170
Nov  3 02:13:28 web01 sshd[1892]: Failed password for invalid user ubuntu from 185.220.101.47 port 56170 ssh2
Nov  3 02:13:29 web01 sshd[1893]: Failed password for backup from 185.220.101.47 port 48670 ssh2
Nov  3 02:13:35 web01 sshd[1894]: Failed password for backup from 185.220.101.47 port 33751 ssh2
Nov  3 02:13:39 web01 sshd[1895]: Invalid user oracle from 185.220.101.47 port 37334
Nov  3 02:13:40 web01 sshd[1896]: Failed password for invalid user oracle from 185.220.101.47 port 37334 ssh2
Nov  3 02:13:45 web01 sshd[1897]: Invalid user admin from 185.220.101.47 port 31881
Nov  3 02:13:46 web01 sshd[1898]: Failed password for invalid user admin from 185.220.101.47 port 31881 ssh2
Nov  3 02:13:48 web01 sshd[1899]: Invalid user test from 185.220.101.47 port 59069
Nov  3 02:13:49 web01 sshd[1845]: Accepted publickey for adaeze from 10.0.2.15 port 52836 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 02:13:49 web01 sshd[1900]: Failed password for invalid user test from 185.220.101.47 port 59069 ssh2
Nov  3 02:13:50 web01 sshd[1846]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
Nov  3 02:13:52 web01 sshd[1901]: Invalid user admin from 185.220.101.47 port 38770
Nov  3 02:13:53 web01 sshd[1902]: Failed password for invalid user admin from 185.220.101.47 port 38770 ssh2
Nov  3 02:13:54 web01 sshd[1903]: Invalid user postgres from 185.220.101.47 port 33769
Nov  3 02:13:55 web01 sshd[1904]: Failed password for invalid user postgres from 185.220.101.47 port 33769 ssh2
Nov  3 02:13:58 web01 sshd[1905]: Invalid user ubuntu from 185.220.101.47 port 36373
Nov  3 02:13:59 web01 sshd[1906]: Failed password for invalid user ubuntu from 185.220.101.47 port 36373 ssh2
Nov  3 02:14:03 web01 sshd[1907]: Invalid user admin from 185.220.101.47 port 41685
Nov  3 02:14:04 web01 sshd[1908]: Failed password for invalid user admin from 185.220.101.47 port 41685 ssh2
Nov  3 02:14:08 web01 sshd[1909]: Invalid user ubuntu from 185.220.101.47 port 56698
Nov  3 02:14:09 web01 sshd[1910]: Failed password for invalid user ubuntu from 185.220.101.47 port 56698 ssh2
Nov  3 02:14:11 web01 sshd[1911]: Failed password for root from 185.220.101.47 port 50509 ssh2
Nov  3 02:14:13 web01 sshd[1912]: Invalid user oracle from 185.220.101.47 port 52871
Nov  3 02:14:14 web01 sshd[1913]: Failed password for invalid user oracle from 185.220.101.47 port 52871 ssh2
Nov  3 02:14:15 web01 sshd[1914]: Invalid user oracle from 185.220.101.47 port 63740
Nov  3 02:14:16 web01 sshd[1915]: Failed password for invalid user oracle from 185.220.101.47 port 63740 ssh2
Nov  3 02:14:17 web01 sshd[1916]: Invalid user admin from 185.220.101.47 port 53119
Nov  3 02:14:18 web01 sshd[1917]: Failed password for invalid user admin from 185.220.101.47 port 53119 ssh2
Nov  3 02:14:23 web01 sshd[1918]: Invalid user oracle from 185.220.101.47 port 61052
Nov  3 02:14:24 web01 sshd[1919]: Failed password for invalid user oracle from 185.220.101.47 port 61052 ssh2
Nov  3 02:14:25 web01 sshd[1920]: Failed password for root from 185.220.101.47 port 33720 ssh2
Nov  3 02:14:27 web01 sshd[1921]: Invalid user oracle from 185.220.101.47 port 35019
Nov  3 02:14:28 web01 sshd[1922]: Failed password for invalid user oracle from 185.220.101.47 port 35019 ssh2
Nov  3 02:14:32 web01 sshd[1923]: Invalid user test from 185.220.101.47 port 56740
Nov  3 02:14:33 web01 sshd[1924]: Failed password for invalid user test from 185.220.101.47 port 56740 ssh2
Nov  3 02:14:36 web01 sshd[1925]: Failed password for root from 185.220.101.47 port 30045 ssh2
Nov  3 02:14:41 web01 sshd[1926]: Invalid user ubuntu from 185.220.101.47 port 42892
Nov  3 02:14:42 web01 sshd[1927]: Failed password for invalid user ubuntu from 185.220.101.47 port 42892 ssh2
Nov  3 02:14:46 web01 sshd[1928]: Failed password for root from 185.220.101.47 port 33762 ssh2
Nov  3 02:14:49 web01 sshd[1929]: Invalid user ubuntu from 185.220.101.47 port 51692
Nov  3 02:14:50 web01 sshd[1930]: Failed password for invalid user ubuntu from 185.220.101.47 port 51692 ssh2
Nov  3 02:14:51 web01 sshd[1931]: Failed password for root from 185.220.101.47 port 45404 ssh2
Nov  3 02:14:55 web01 sshd[1932]: Invalid user test from 185.220.101.47 port 57422
Nov  3 02:14:56 web01 sshd[1933]: Failed password for invalid user test from 185.220.101.47 port 57422 ssh2
Nov  3 02:15:00 web01 sshd[1934]: Invalid user test from 185.220.101.47 port 52970
Nov  3 02:15:01 web01 sshd[1935]: Failed password for invalid user test from 185.220.101.47 port 52970 ssh2
Nov  3 02:15:02 web01 sshd[1936]: Failed password for backup from 185.220.101.47 port 54750 ssh2
Nov  3 02:15:07 web01 sshd[1937]: Invalid user oracle from 185.220.101.47 port 41303
Nov  3 02:15:08 web01 sshd[1938]: Failed password for invalid user oracle from 185.220.101.47 port 41303 ssh2
Nov  3 02:15:09 web01 sshd[1939]: Invalid user ubuntu from 185.220.101.47 port 34969
Nov  3 02:15:10 web01 sshd[1940]: Failed password for invalid user ubuntu from 185.220.101.47 port 34969 ssh2
Nov  3 02:15:12 web01 sshd[1941]: Invalid user ubuntu from 185.220.101.47 port 58960
Nov  3 02:15:13 web01 sshd[1942]: Failed password for invalid user ubuntu from 185.220.101.47 port 58960 ssh2
Nov  3 02:15:16 web01 sshd[1943]: Invalid user test from 185.220.101.47 port 62929
Nov  3 02:15:17 web01 sshd[1944]: Failed password for invalid user test from 185.220.101.47 port 62929 ssh2
Nov  3 02:15:19 web01 sshd[1945]: Invalid user ubuntu from 185.220.101.47 port 57924
Nov  3 02:15:20 web01 sshd[1946]: Failed password for invalid user ubuntu from 185.220.101.47 port 57924 ssh2
Nov  3 02:15:25 web01 sshd[1947]: Invalid user admin from 185.220.101.47 port 30188
Nov  3 02:15:26 web01 sshd[1948]: Failed password for invalid user admin from 185.220.101.47 port 30188 ssh2
Nov  3 02:15:27 web01 sshd[1949]: Invalid user test from 185.220.101.47 port 47213
Nov  3 02:15:28 web01 sshd[1950]: Failed password for invalid user test from 185.220.101.47 port 47213 ssh2
Nov  3 02:15:29 web01 sshd[1951]: Invalid user ubuntu from 185.220.101.47 port 53083
Nov  3 02:15:30 web01 sshd[1952]: Failed password for invalid user ubuntu from 185.220.101.47 port 53083 ssh2
Nov  3 02:15:33 web01 sshd[1953]: Invalid user postgres from 185.220.101.47 port 47168
Nov  3 02:15:34 web01 sshd[1954]: Failed password for invalid user postgres from 185.220.101.47 port 47168 ssh2
Nov  3 02:15:38 web01 sshd[1955]: Failed password for backup from 185.220.101.47 port 47128 ssh2
Nov  3 02:15:42 web01 sshd[1956]: Invalid user oracle from 185.220.101.47 port 48092
Nov  3 02:15:43 web01 sshd[1957]: Failed password for invalid user oracle from 185.220.101.47 port 48092 ssh2
Nov  3 02:15:47 web01 sshd[1958]: Failed password for backup from 185.220.101.47 port 53661 ssh2
Nov  3 02:15:52 web01 sshd[1959]: Failed password for backup from 185.220.101.47 port 34441 ssh2
Nov  3 02:15:55 web01 sshd[1960]: Failed password for backup from 185.220.101.47 port 37931 ssh2
Nov  3 02:15:58 web01 sshd[1961]: Failed password for backup from 185.220.101.47 port 60650 ssh2
Nov  3 02:16:01 web01 sshd[1962]: Accepted password for backup from 185.220.101.47 port 34929 ssh2
Nov  3 02:16:02 web01 sshd[1963]: pam_unix(sshd:session): session opened for user backup(uid=1001) by (uid=0)
Nov  3 02:16:38 web01 CRON[1838]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:23:33 web01 CRON[1839]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:30:44 web01 CRON[1840]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:31:26 web01 sshd[1847]: Accepted publickey for adaeze from 10.0.2.15 port 57931 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 02:31:27 web01 sshd[1848]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
Nov  3 02:37:01 web01 CRON[1841]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:44:55 web01 CRON[1842]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Nov  3 02:51:19 web01 sshd[1849]: Accepted publickey for adaeze from 10.0.2.15 port 38433 ssh2: ED25519 SHA256:q8fC2v...
Nov  3 02:51:20 web01 sshd[1850]: pam_unix(sshd:session): session opened for user adaeze(uid=1002) by (uid=0)
EOF

# ---- Lab B: installer integrity (random tampered file each build) ----
cd downloads
for f in agent-installer-v4.2.exe vpn-client-3.1.msi backup-tool-1.8.deb pdf-reader-2026.2.exe; do
  head -c 2097152 /dev/urandom > "$f"
done
sha256sum *.exe *.msi *.deb > vendor_hashes.txt
victim=$(ls *.exe *.msi *.deb | shuf -n1)
printf 'injected-payload' >> "$victim"
echo "$victim" > "$LAB/.answer-lab-b"
cd ..

# ---- Lab C: permissions and SSH hardening ----
cat > etc/passwd <<'EOF'
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
syslog:x:104:110::/home/syslog:/usr/sbin/nologin
sshd:x:110:65534::/run/sshd:/usr/sbin/nologin
adaeze:x:1002:1002:Adaeze O.:/home/adaeze:/bin/bash
deploy:x:1001:1001:Deploy user:/home/deploy:/bin/bash
analyst:x:1003:1003:Security analyst:/home/analyst:/bin/bash
EOF
chmod 644 etc/passwd
cat > etc/group <<'EOF'
root:x:0:
adm:x:4:syslog,adaeze
sudo:x:27:adaeze
shadow:x:42:
deploy:x:1001:
analyst:x:1003:
EOF
chmod 644 etc/group
cat > etc/shadow <<'EOF'
root:$y$j9T$4dd03c0cc945e50a3265c9$4421e807491242206a734f426d2db165d48490ed87a:20390:0:99999:7:::
daemon:*:20390:0:99999:7:::
syslog:*:20390:0:99999:7:::
adaeze:$y$j9T$16432b4411dfad4437fd83$460d69bcbe05ed3eead403c731a2dc9bbb9870828bf:20401:0:99999:7:::
deploy:$y$j9T$cea034810a22978ce9d110$ff5460d50f9da44cd31b32676191dea3283f0dc08a7:20388:0:99999:7:::
analyst:$y$j9T$a26850374ff15cd5b3b5d1$40a69d5ebb8c7e7c7f7b5aa13b1f2f26d8bb7df1034:20410:0:99999:7:::
EOF
chmod 646 etc/shadow
cat > etc/ssh/sshd_config <<'EOF'
# This is the sshd server system-wide configuration file.
# See sshd_config(5) for more information.
Include /etc/ssh/sshd_config.d/*.conf

Port 22
#AddressFamily any
#ListenAddress 0.0.0.0

PermitRootLogin yes
MaxAuthTries 6
PubkeyAuthentication yes
PasswordAuthentication yes
PermitEmptyPasswords no
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding yes
PrintMotd no
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server
EOF
chmod 644 etc/ssh/sshd_config
printf 'Defaults env_reset\nroot ALL=(ALL:ALL) ALL\n' > etc/sudoers && chmod 440 etc/sudoers
printf -- '-----BEGIN OPENSSH PRIVATE KEY-----\n(practice key, not real)\n-----END OPENSSH PRIVATE KEY-----\n' > home/deploy/.ssh/id_rsa && chmod 644 home/deploy/.ssh/id_rsa
printf 'ssh-ed25519 AAAAC3Nza... deploy@web01\n' > home/deploy/.ssh/id_rsa.pub && chmod 644 home/deploy/.ssh/id_rsa.pub
touch home/deploy/.ssh/authorized_keys && chmod 600 home/deploy/.ssh/authorized_keys

echo "Lab ready in $LAB"
```

Run `bash build-lab.sh` again any time to reset the lab. Lab B picks a new tampered file on every build.

## Step 2. Lab A: find the brute force

Work in `~/secplus-lab/log`. Answer the same three questions as PBQ 1:

1. Which IP made the brute-force attempts?
2. Which account did it log in to?
3. How many `Failed password` entries came from that IP?

Commands worth trying, in this order:

```bash
cd ~/secplus-lab/log
head auth.log
grep -c 'Failed password' auth.log
grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr
grep 'Accepted' auth.log
grep 'Invalid user' auth.log | awk '{print $8}' | sort | uniq -c | sort -nr
```

Ask yourself why `grep '<attacker IP>' auth.log | wc -l` gives a bigger number than your answer to question 3.

## Step 3. Lab B: verify the installers

```bash
cd ~/secplus-lab/downloads
cat vendor_hashes.txt
sha256sum *.exe *.msi *.deb
sha256sum -c vendor_hashes.txt
cat ~/secplus-lab/.answer-lab-b    # check your answer
```

Then answer: what would you do with the failed file, and what would prove who created the file, not just that it is unchanged?

## Step 4. Lab C: find and fix permissions

This time you actually fix things. Work in `~/secplus-lab`.

```bash
cd ~/secplus-lab
ls -l etc
ls -la home/deploy/.ssh
grep -n 'PermitRootLogin\|PasswordAuthentication' etc/ssh/sshd_config

# Your fixes (work out the right numbers before you look at Part 6):
chmod ??? etc/shadow
chmod ??? home/deploy/.ssh/id_rsa
sed -i 's/^PermitRootLogin yes/PermitRootLogin ??/' etc/ssh/sshd_config

# Verify
stat -c '%a %n' etc/shadow home/deploy/.ssh/id_rsa
grep '^PermitRootLogin' etc/ssh/sshd_config
```

You pass Lab C when `stat` shows `640 etc/shadow` and `600 home/deploy/.ssh/id_rsa`, and the config line reads `PermitRootLogin no`.

## Step 5. Lab D: scan your own machine

Install nmap (`sudo apt install nmap`) and scan only machines you own. Scanning other people's systems without permission is illegal.

```bash
nmap localhost
nmap -sV localhost
ss -tlnp        # which processes are listening, compare with nmap
```

For each open port, write the service name, whether it is cleartext or encrypted, and its secure replacement if one exists.

## Command cheat sheet

| Command | What it does |
|---|---|
| `grep -i -c -v -n -o` | search; ignore case, count, invert, line numbers, only the match |
| `awk '{print $N}'` | print field N; $NF is the last field, $(NF-3) the fourth from last |
| `cut -d ' ' -f N` | split on a delimiter and keep field N |
| `sort | uniq -c | sort -nr` | count repeats and list the most frequent first |
| `wc -l` | count lines |
| `head / tail -n 20` | first or last 20 lines |
| `sha256sum -c file` | check files against a list of published hashes |
| `ls -l / stat -c '%a %n'` | show permissions as letters / as octal |
| `chmod 640 file` | owner rw, group r, others none (r=4 w=2 x=1) |
| `nmap -sn / -sV / -p` | host discovery / service versions / specific ports |
| `ss -tlnp` | listening TCP ports and their processes |

---

# Part 6: Proctor pack (proctor only)

## Running the exam

- Start a 90-minute timer when she opens Part 1. Call out the time at 45, 15 and 5 minutes remaining.
- Do not explain questions or commands. Answer only 'read the question again'.
- If the timer runs out, stop. Unanswered questions score zero.
- After marking, ask the oral questions at the end of this part.

### Pacing guide

Use this to tell her if she is behind. On the real exam, running out of time is a common way to fail.

| Time elapsed | She should be at | If she is behind |
|---|---|---|
| 0:25 | Finished or flagged all 5 PBQs | Tell her to flag the PBQ and move to the MCQs |
| 0:45 | About question 35 | Spend no more than 60 seconds per question |
| 1:05 | About question 60 | Guess, flag and move on |
| 1:20 | Question 90 | Use the last 10 minutes on flagged questions |

## Part 1 PBQ solutions

**PBQ 1. Investigate an SSH brute-force alert**

- Source IP address of the brute-force attack: **193.32.162.71**
- Account the attacker successfully logged in to: **backup**
- Number of 'Failed password' entries from that IP: **54**
- Practice 1d: `grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr`

Count failures per source with: grep 'Failed password' /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr. 193.32.162.71 leads with 54 failures (the other sources are a small scanner and a user mistyping a password). Note that grep '193.32.162.71' | wc -l over-counts, because 'Invalid user' lines also contain the IP. Then grep 'Accepted' shows 'Accepted password for backup' from the same IP right after the attempts, so that account is compromised. In a real incident: disable the account, end its sessions, block the IP, and review what the session did.

**PBQ 2. Find insecure services with nmap**

- Port offering a cleartext remote shell that should be disabled: **23**
- Open port administrators should use for remote shell access instead: **22**
- Port transferring files in cleartext that should be replaced with SFTP or FTPS: **21**

nmap -sV 10.0.5.20 shows telnet on 23 (cleartext shell, replace with SSH on 22) and FTP on 21 (cleartext credentials and files, replace with SFTP over 22 or FTPS). For extra credit in a real report: MySQL on 3306 and SMB on 139/445 should not be reachable from the whole subnet.

**PBQ 3. Verify installer integrity**

- Which file failed the integrity check?: **backup-tool-1.8.deb**
- What should you do with that file?: **B. Quarantine it, report it, and obtain a fresh copy from the vendor's official source, then verify again**
- Which security goal does comparing hashes confirm?: **B. Integrity**

sha256sum -c vendor_hashes.txt reports backup-tool-1.8.deb: FAILED. Its hash starts and ends with the same characters as the published value, which is a trap for anyone comparing only the first few characters: always compare the full hash (or let -c do it). A mismatch means the file was altered or corrupted, so it must not be deployed. Hashing proves integrity; proving who produced the file needs a digital signature.

**PBQ 4. Harden file permissions and SSH**

- Which file in /etc has dangerously permissive permissions?: **/etc/shadow**
- Octal mode to set on that file (owner read/write, group read, others nothing): **640  (chmod 640 /etc/shadow)**
- Octal mode the deploy user's private key id_rsa should have: **600  (chmod 600 /home/deploy/.ssh/id_rsa)**
- sshd_config directive that should be set to 'no' to block direct root logins: **PermitRootLogin**

ls -l /etc shows /etc/shadow as -rw-r--rw-: anyone can read and even modify password hashes. It should be 640 (rw-r-----, root:shadow). The deploy user's private key is -rw-r--r--, readable by every user; SSH keys must be 600. In sshd_config, PermitRootLogin yes should be no (and PasswordAuthentication no would block the kind of brute force in PBQ 1).

**PBQ 5. Configure the perimeter firewall**

- Rule 1 (Any to 10.1.1.10): **443 / ALLOW**
- Rule 2 (192.168.10.0/24 to 10.1.1.10): **22 / ALLOW**
- Rule 3 (10.1.1.10 to 10.1.2.20): **3306 / ALLOW**
- Rule 4 (Any to Any): **Any / DENY**

Allow only what is needed: HTTPS (443) from anywhere to web01, SSH (22) from the admin LAN to web01, MySQL (3306) only from web01 to db01, and finish with a deny any/any rule (implicit deny). Opening port 80 or 3389, or allowing 3306 from Any, would fail the requirement.

## Part 2 multiple-choice key

| Q | Answer | Domain | Why |
|---|---|---|---|
| 6 | **C** | 1.0 | A honeytoken is fake data that alerts when used. A honeypot is a decoy system; a honeynet is a network of them. |
| 7 | **A** | 4.0 | Containment comes first to stop the spread. Reimaging is eradication and recovery, and doing it first destroys evidence. |
| 8 | **A** | 5.0 | SLE = $200,000 x 0.25 = $50,000. ARO = 0.5. ALE = SLE x ARO = $25,000. |
| 9 | **C** | 2.0 | A watering hole compromises a site the victims already trust and visit. |
| 10 | **B** | 5.0 | Behavioural metrics such as fewer clicks and more reports show real change. |
| 11 | **A** | 2.0 | Impersonating an executive by email to trigger a fraudulent payment is BEC. Smishing uses SMS; pharming redirects traffic via DNS or hosts files. |
| 12 | **B** | 3.0 | IaC makes deployments repeatable and reviewable and reduces configuration drift. |
| 13 | **A** | 2.0 | Defacement with a political or social message points to hacktivists, whose motive is ideology. |
| 14 | **D** | 5.0 | The risk register is the central record of risks and how they are managed. |
| 15 | **D** | 3.0 | A load balancer spreads traffic and uses health checks to remove failed nodes. |
| 16 | **B** | 5.0 | The right to erasure, often called the right to be forgotten, is a key GDPR right. |
| 17 | **A** | 5.0 | Mean time between failures measures reliability. MTTR is mean time to repair. |
| 18 | **B** | 3.0 | A jump server (jump box or bastion host) is the controlled entry point for admin access to a secure zone. |
| 19 | **A** | 5.0 | A right-to-audit clause allows the customer (or a third party) to assess the vendor's controls. |
| 20 | **A, B** | 4.0 | IdP sign-in logs show where and how she authenticated, and VPN logs show remote session origins. |
| 21 | **C** | 2.0 | Mass encryption plus a ransom note is ransomware. |
| 22 | **D** | 4.0 | A legal hold suspends normal deletion so relevant data is preserved. |
| 23 | **D** | 3.0 | Data sovereignty means data is subject to the laws of the country where it is stored, so some laws require in-country storage. |
| 24 | **D** | 5.0 | A service level agreement sets measurable performance commitments and remedies. |
| 25 | **B** | 4.0 | A sandbox is an isolated environment for detonating and observing suspicious files. |
| 26 | **D, E** | 5.0 | Non-compliance can bring fines, sanctions and loss of licence, as well as reputational damage. |
| 27 | **C** | 2.0 | Compromising a supplier to reach its customers is a supply chain attack. |
| 28 | **D** | 3.0 | Masking hides part of the value in the display while the real data remains stored elsewhere. |
| 29 | **C** | 4.0 | Endpoint detection and response provides behavioural detection, remote isolation and response actions. |
| 30 | **C** | 3.0 | FDE protects data at rest when the device leaves your control. |
| 31 | **B** | 2.0 | Forged ARP replies tie the gateway IP to the attacker's MAC so traffic passes through them: an on-path attack via ARP poisoning. |
| 32 | **D** | 4.0 | Default credentials are the most common way IoT devices are compromised. |
| 33 | **B** | 5.0 | When the control costs more than the expected loss, accepting the risk can be reasonable, as long as it is documented. |
| 34 | **B** | 4.0 | Memory is lost at power-off, so it is collected before disk, remote logs and backups. |
| 35 | **C** | 4.0 | Privileged access management with just-in-time, time-limited elevation reduces standing privileges. |
| 36 | **D** | 2.0 | CSRF makes the victim's browser send an authenticated request. Anti-CSRF tokens and SameSite cookies mitigate it. |
| 37 | **A** | 2.0 | Reusing breached credential pairs on other sites is credential stuffing. MFA and breached-password checks are the key mitigations. |
| 38 | **D** | 3.0 | Tokenization replaces the card number with a surrogate token that maps back only inside the payment provider's vault. |
| 39 | **B** | 1.0 | Key stretching (PBKDF2, bcrypt, scrypt, Argon2) makes each guess slow. Salting defeats precomputed rainbow tables but does not slow a single guess. |
| 40 | **B** | 4.0 | LDAPS uses TCP 636. Plain LDAP is 389. |
| 41 | **B** | 1.0 | A gap analysis compares current state to a target framework or baseline. |
| 42 | **B** | 3.0 | Even in SaaS the customer remains responsible for its data and who has access to it. |
| 43 | **C** | 5.0 | A BIA identifies critical processes, their dependencies, and the RTO and RPO needed for each. |
| 44 | **A** | 1.0 | Elliptic curve cryptography uses public/private key pairs. AES, 3DES and ChaCha20 are symmetric. |
| 45 | **B** | 3.0 | Physical separation (air gap) gives the strongest isolation for critical industrial systems. |
| 46 | **A** | 1.0 | Signs discourage an attacker but do not stop or record anything, so they are deterrent. The cameras would be detective. |
| 47 | **D** | 4.0 | Data loss prevention inspects content leaving the organization and blocks sensitive data. |
| 48 | **D** | 2.0 | When patching is impossible, segmentation and isolation act as a compensating control. |
| 49 | **C** | 3.0 | In IaaS the provider secures the physical hosts and hypervisor; the customer owns the guest OS, applications and data. |
| 50 | **B, E** | 3.0 | WPA3-Enterprise with 802.1X/RADIUS gives per-user authentication and strong encryption. MAC filtering and hidden SSIDs are easily bypassed, and WEP is broken. |
| 51 | **B** | 2.0 | Spraying tries one or a few common passwords across many accounts to stay under lockout thresholds. |
| 52 | **B** | 3.0 | Fail-closed blocks traffic on failure, favouring security over availability. |
| 53 | **B** | 4.0 | Threat hunting is proactive and hypothesis-driven, looking for threats that slipped past existing detections. |
| 54 | **A** | 4.0 | OAuth delegates authorization with access tokens. OpenID Connect adds authentication on top of it. |
| 55 | **C** | 1.0 | Only the holder of the private key can produce the signature, which gives non-repudiation. A bare hash proves integrity but anyone can recompute it; AES and TLS provide confidentiality. |
| 56 | **B** | 5.0 | The AUP defines acceptable use of company systems. |
| 57 | **B** | 4.0 | Chain of custody proves the evidence was not tampered with. |
| 58 | **C** | 4.0 | Logging in lets the scanner see patch levels and settings directly. A non-credentialed scan shows the outsider's view. |
| 59 | **D** | 4.0 | DMARC sets the policy (none, quarantine, reject) and reporting addresses. |
| 60 | **B** | 3.0 | Recovery point objective is the maximum acceptable data loss measured in time. RTO is how fast service must be restored. |
| 61 | **A** | 4.0 | A reported issue that does not exist is a false positive. |
| 62 | **A** | 5.0 | Insurance shifts the financial impact to a third party: risk transference. |
| 63 | **C** | 2.0 | Malicious code that triggers on a condition is a logic bomb. |
| 64 | **D** | 2.0 | Writing past an allocated buffer into adjacent memory is a buffer overflow. |
| 65 | **C** | 5.0 | Procedures are step-by-step. Policies state intent, standards set mandatory specifics, guidelines are recommendations. |
| 66 | **B** | 4.0 | Disabling removes access immediately while preserving data and audit history for investigation or handover. |
| 67 | **D** | 4.0 | Prioritize by severity and exposure: a critical flaw reachable from the internet carries the most risk. |
| 68 | **A** | 4.0 | A SIEM collects and correlates events. SOAR automates the response to them. |
| 69 | **A** | 5.0 | A known environment test (formerly white box) gives testers full information. |
| 70 | **A** | 2.0 | Typosquatting registers look-alike domains. Domain hijacking takes control of the real domain's registration. |
| 71 | **C** | 1.0 | Bollards are a physical control. Technical controls are enforced by systems (firewalls, EDR), managerial controls are policies and risk assessments, and operational controls are carried out by people day to day. |
| 72 | **A** | 3.0 | A hot site is fully equipped and replicated, ready almost immediately. Warm sites need time to load data; cold sites have only space and power. |
| 73 | **A** | 5.0 | The controller decides why and how data is processed; the processor acts on the controller's behalf. |
| 74 | **D** | 5.0 | Risk appetite is how much risk the organization is willing to take on in pursuit of its goals. |
| 75 | **A** | 2.0 | Long-term, well-funded, stealthy operations attributed to a government are the hallmark of nation-state actors (often called APTs). |
| 76 | **A** | 5.0 | SOC 2 Type II tests operating effectiveness over a period. Type I covers design at a single point in time. |
| 77 | **C** | 1.0 | The username is identification. The password and push prove the identity, which is authentication. Authorization decides what they may access; accounting records what they did. |
| 78 | **A, D** | 2.0 | Training helps users spot phishing, and email authentication blocks spoofed senders. The other options address different risks. |
| 79 | **D** | 4.0 | Removing the threat and its persistence is eradication. Recovery is restoring systems to normal operation. |
| 80 | **D** | 1.0 | A backout (rollback) plan restores the prior state. Impact analysis assesses consequences; the maintenance window is when the change happens. |
| 81 | **D** | 1.0 | The policy engine (control plane) makes the decision, the policy administrator relays it, and the policy enforcement point (data plane) carries it out. |
| 82 | **C** | 2.0 | Unapproved technology used inside the organization is shadow IT. |
| 83 | **C** | 4.0 | SNMPv1 and v2c send community strings in cleartext. SNMPv3 adds authentication and encryption. |
| 84 | **B** | 4.0 | MFA needs different factor types: something you know (password) plus something you are (fingerprint). The others pair two of the same type. |
| 85 | **C** | 2.0 | The state changed between the check and the use: a TOCTOU race condition. |
| 86 | **D** | 2.0 | This is SQL injection. Parameterized queries keep input as data, never as SQL. Length limits are easy to bypass and detection-only mode blocks nothing. |
| 87 | **D** | 4.0 | Security orchestration, automation and response runs automated playbooks. |
| 88 | **A** | 4.0 | SAML exchanges XML assertions between an identity provider and service providers for web SSO. |
| 89 | **A** | 2.0 | The payload is saved on the server and served to every visitor, so it is stored (persistent) XSS. |
| 90 | **D** | 3.0 | Secure Access Service Edge combines networking and security services delivered from the cloud. |

## Scoring

### Domain breakdown

Count her correct answers in each row. The real exam weights domains differently, so a weak domain matters even with a passing total. Aim for 81% or more in every row.

| Domain | Exam weight | Questions in this mock | Points | Correct | % |
|---|---|---|---|---|---|
| 1.0 General Security Concepts | 12% | PBQ 3 (3 pts); 6, 39, 41, 44, 46, 55, 71, 77, 80, 81 | 13 | | |
| 2.0 Threats, Vulnerabilities and Mitigations | 22% | PBQ 2 (3 pts); 9, 11, 13, 21, 27, 31, 36, 37, 48, 51, 63, 64, 70, 75, 78, 82, 85, 86, 89 | 22 | | |
| 3.0 Security Architecture | 18% | PBQ 5 (4 pts); 12, 15, 18, 23, 28, 30, 38, 42, 45, 49, 50, 52, 60, 72, 90 | 19 | | |
| 4.0 Security Operations | 28% | PBQ 1 (3 pts), PBQ 4 (4 pts); 7, 20, 22, 25, 29, 32, 34, 35, 40, 47, 53, 54, 57, 58, 59, 61, 66, 67, 68, 79, 83, 84, 87, 88 | 31 | | |
| 5.0 Security Program Management and Oversight | 20% | 8, 10, 14, 16, 17, 19, 24, 26, 33, 43, 56, 62, 65, 69, 73, 74, 76 | 17 | | |
| **Total** | | | **102** | | |

### Score conversion

Scaled score = 100 + 800 x (points / 102)

| Points | Scaled | Result |
|---|---|---|
| 102 | 900 | Pass |
| 95 | 845 | Pass |
| 90 | 806 | Pass |
| 87 | 782 | Pass |
| 83 | 751 | Pass |
| 82 | 743 | Below 750 |
| 78 | 712 | Below 750 |
| 70 | 649 | Below 750 |
| 60 | 571 | Below 750 |

A score of 800 or higher (89+ points) gives a comfortable margin for exam-day nerves.

## Part 4 retake solutions (version B)

**PBQ B1. Investigate an SSH brute-force alert**

- Source IP address of the brute-force attack: **91.240.118.29**
- Account the attacker successfully logged in to: **svc_web**
- Number of 'Failed password' entries from that IP: **56**
- Practice B1d: `grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr`

Count failures per source with: grep 'Failed password' /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr. 91.240.118.29 leads with 56 failures (the other sources are a small scanner and a user mistyping a password). Note that grep '91.240.118.29' | wc -l over-counts, because 'Invalid user' lines also contain the IP. Then grep 'Accepted' shows 'Accepted password for svc_web' from the same IP right after the attempts, so that account is compromised. In a real incident: disable the account, end its sessions, block the IP, and review what the session did.

**PBQ B3. Verify installer integrity**

- Which file failed the integrity check?: **agent-installer-v4.2.exe**
- What should you do with that file?: **B. Quarantine it, report it, and obtain a fresh copy from the vendor's official source, then verify again**
- Which security goal does comparing hashes confirm?: **B. Integrity**

sha256sum -c vendor_hashes.txt reports agent-installer-v4.2.exe: FAILED. Its hash starts and ends with the same characters as the published value, which is a trap for anyone comparing only the first few characters: always compare the full hash (or let -c do it). A mismatch means the file was altered or corrupted, so it must not be deployed. Hashing proves integrity; proving who produced the file needs a digital signature.

**PBQ B4. Harden file permissions and SSH**

- Which file in /etc has dangerously permissive permissions?: **/etc/shadow**
- Octal mode to set on that file (owner read/write, group read, others nothing): **640  (chmod 640 /etc/shadow)**
- Octal mode the deploy user's private key id_rsa should have: **600  (chmod 600 /home/deploy/.ssh/id_rsa)**
- sshd_config directive that should be set to 'no' to block direct root logins: **PermitRootLogin**

ls -l /etc shows /etc/shadow as -rw-r--rw-: anyone can read and even modify password hashes. It should be 640 (rw-r-----, root:shadow). The deploy user's private key is -rw-r--r--, readable by every user; SSH keys must be 600. In sshd_config, PermitRootLogin yes should be no (and PasswordAuthentication no would block the kind of brute force in PBQ 1).

Version B PBQ 2 and PBQ 5 use different scenarios:

**PBQ B2 (mail server nmap):**

- B2a: **110** is cleartext POP3; use **995** (POP3S). Note 995 is not open yet, so it needs enabling.
- B2b: **143** (IMAP) has its secure equivalent **993** (IMAPS) already open.
- B2c: close **389** so directory traffic uses LDAPS on 636.

**PBQ B5 (mail firewall):**

- Rule 1 (Any to 10.1.1.25): **25 / ALLOW**
- Rule 2 (Any to 10.1.1.25): **993 / ALLOW**
- Rule 3 (192.168.10.0/24 to 10.1.1.25): **22 / ALLOW**
- Rule 4 (Any to Any): **Any / DENY**

Allowing 110 or 143 would fail requirement 2 (encrypted IMAP only). The last rule is the explicit deny.

## Part 5 hands-on lab answers

- Lab A: attacker **185.220.101.47**, compromised account **backup**, **50** failed password entries.
- Lab B: the tampered file is random on every build; she checks it with `cat ~/secplus-lab/.answer-lab-b`. Correct action: quarantine, report, get a fresh copy from the vendor and verify again. A digital signature proves who created the file.
- Lab C: `chmod 640 etc/shadow`, `chmod 600 home/deploy/.ssh/id_rsa`, `PermitRootLogin no`. Bonus: `PasswordAuthentication no` once SSH keys are in place.
- Lab D: answers depend on her machine. Check she correctly labels each service cleartext or encrypted.

## Oral questions (ask after the exam)

Ask out loud. She should answer without notes in under a minute each.

**1. Walk me through the incident response process, in order.**  
Model answer: Preparation, detection, analysis, containment, eradication, recovery, lessons learned. Bonus: containment comes before eradication so evidence is preserved and spread stops.

**2. What is the difference between RTO and RPO? Give an example of each.**  
Model answer: RTO is how quickly a system must be back (e.g. 4 hours). RPO is how much data loss is acceptable measured in time (e.g. 15 minutes, so backups or replication at least that often).

**3. How does a digital signature give integrity, authentication and non-repudiation?**  
Model answer: The sender hashes the message and encrypts the hash with their private key. The receiver decrypts with the sender's public key and compares hashes: a match proves the message is unchanged and that only the private key holder could have signed it.

**4. IDS versus IPS: where does each sit and what can each do?**  
Model answer: An IDS is passive (often on a SPAN or tap) and only alerts. An IPS is inline and can block or drop traffic. Inline means it can also cause outages if it fails closed or has false positives.

**5. What do SPF, DKIM and DMARC each do?**  
Model answer: SPF lists servers allowed to send for a domain. DKIM signs messages so receivers can verify them. DMARC tells receivers what to do when SPF or DKIM fail (none, quarantine, reject) and where to send reports.

**6. Name the four risk responses and give an example of each.**  
Model answer: Mitigate (add MFA), transfer (cyber insurance), accept (document a low risk), avoid (stop the risky activity, such as not launching a feature).

**7. Hashing versus encryption versus encoding.**  
Model answer: Hashing is one-way and proves integrity. Encryption is reversible with a key and gives confidentiality. Encoding (Base64) is reversible by anyone and gives no security.

**8. Explain zero trust in thirty seconds. What are the control plane and data plane?**  
Model answer: Never trust based on network location; verify every request using identity, device and context. Control plane: policy engine and administrator decide. Data plane: policy enforcement points carry out the decision.

**9. Give four insecure protocols and their secure replacements, with ports.**  
Model answer: Telnet 23 to SSH 22; HTTP 80 to HTTPS 443; FTP 21 to SFTP 22 or FTPS 990; LDAP 389 to LDAPS 636; SNMPv1/v2c to SNMPv3 (161).

**10. Calculate the ALE: asset worth $80,000, exposure factor 50%, expected once every four years.**  
Model answer: SLE = 80,000 x 0.5 = $40,000. ARO = 0.25. ALE = $10,000 per year.


